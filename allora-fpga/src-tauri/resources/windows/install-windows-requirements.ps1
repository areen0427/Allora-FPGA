#Requires -Version 5.1

[CmdletBinding()]
param(
    [string]$RequirementsFile
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path

if ([string]::IsNullOrWhiteSpace($RequirementsFile)) {
    $RequirementsFile = Join-Path $scriptDirectory 'windows-runtime-requirements.txt'
}

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Update-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
    $env:Path = (@($machinePath, $userPath, $cargoBin) | Where-Object { $_ }) -join ';'
}

function Invoke-WingetInstall {
    param(
        [Parameter(Mandatory)] [string]$Id,
        [Parameter(Mandatory)] [string]$Name,
        [string]$Override,
        [switch]$Force
    )

    Write-Host "`n==> $Name" -ForegroundColor Cyan

    if (-not $Force) {
        & winget.exe list --id $Id --exact --accept-source-agreements | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host 'Already installed.' -ForegroundColor DarkGreen
            return
        }
    }

    $arguments = @(
        'install', '--id', $Id, '--exact', '--source', 'winget',
        '--accept-package-agreements', '--accept-source-agreements'
    )

    if ($Force) {
        $arguments += '--force'
    }

    if ($Override) {
        $arguments += @('--override', $Override)
    } else {
        $arguments += '--silent'
    }

    & winget.exe @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "winget failed while installing $Name (exit code $LASTEXITCODE)."
    }
}

function Test-VisualStudioCppTools {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (-not (Test-Path -LiteralPath $vswhere)) {
        return $false
    }

    $installationPath = & $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    return -not [string]::IsNullOrWhiteSpace(($installationPath | Select-Object -First 1))
}

function Enable-RequiredWindowsFeature {
    param(
        [Parameter(Mandatory)] [string]$FeatureName,
        [Parameter(Mandatory)] [string]$Name
    )

    Write-Host "`n==> $Name" -ForegroundColor Cyan
    try {
        $feature = Get-WindowsOptionalFeature -Online -FeatureName $FeatureName
        if ($feature.State -eq 'Enabled') {
            Write-Host 'Already enabled.' -ForegroundColor DarkGreen
            return
        }

        Enable-WindowsOptionalFeature -Online -FeatureName $FeatureName -All -NoRestart | Out-Null
        Write-Host 'Enabled. Windows may request a restart before MSI creation works.' -ForegroundColor Yellow
    } catch {
        Write-Warning "Could not enable $FeatureName automatically. If a Tauri MSI build later reports 'failed to run light.exe', enable VBSCRIPT from Settings > Apps > Optional features > More Windows features. Details: $($_.Exception.Message)"
    }
}

function Install-RustTarget {
    param([Parameter(Mandatory)] [string]$Target)

    Write-Host "`n==> Rust stable MSVC toolchain and $Target target" -ForegroundColor Cyan
    Update-ProcessPath

    $rustupCommand = Get-Command rustup.exe -ErrorAction SilentlyContinue
    $rustupPath = if ($rustupCommand) { $rustupCommand.Source } else { $null }
    if (-not $rustupPath) {
        $fallback = Join-Path $env:USERPROFILE '.cargo\bin\rustup.exe'
        if (Test-Path -LiteralPath $fallback) {
            $rustupPath = $fallback
        }
    }
    if (-not $rustupPath) {
        throw 'Rustup was installed but is not visible yet. Restart Windows and run this installer again.'
    }

    & $rustupPath toolchain install stable-msvc
    if ($LASTEXITCODE -ne 0) { throw 'Failed to install the Rust stable-msvc toolchain.' }

    & $rustupPath default stable-msvc
    if ($LASTEXITCODE -ne 0) { throw 'Failed to select Rust stable-msvc.' }

    & $rustupPath target add $Target
    if ($LASTEXITCODE -ne 0) { throw "Failed to add Rust target $Target." }
}

function Install-Msys2Packages {
    param(
        [Parameter(Mandatory)] [string]$MsysRoot,
        [Parameter(Mandatory)] [string]$Packages
    )

    Write-Host "`n==> MSYS2 GNU Make and UCRT64 GCC" -ForegroundColor Cyan
    $bash = Join-Path $MsysRoot 'usr\bin\bash.exe'
    if (-not (Test-Path -LiteralPath $bash)) {
        throw "MSYS2 was installed but bash.exe was not found at $bash."
    }

    $packageList = ($Packages -split ',' | Where-Object { $_ }) -join ' '
    & $bash -lc "pacman -Syu --noconfirm --needed $packageList"
    if ($LASTEXITCODE -ne 0) {
        throw "MSYS2 package installation failed (exit code $LASTEXITCODE). Run the installer again after closing any MSYS2 windows."
    }
}

function Install-OssCadSuite {
    param(
        [Parameter(Mandatory)] [string]$Repository,
        [Parameter(Mandatory)] [string]$InstallRoot
    )

    Write-Host "`n==> Latest OSS CAD Suite Windows x64" -ForegroundColor Cyan
    $suiteDirectory = Join-Path $InstallRoot 'oss-cad-suite'
    $yosysCandidates = @(
        (Join-Path $suiteDirectory 'bin\yosys.exe'),
        (Join-Path $suiteDirectory 'bin\yosys')
    )
    if ($yosysCandidates | Where-Object { Test-Path -LiteralPath $_ }) {
        Write-Host "Already installed at $suiteDirectory." -ForegroundColor DarkGreen
        return
    }

    New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
    $headers = @{
        Accept = 'application/vnd.github+json'
        'User-Agent' = 'Allora-FPGA-Windows-Requirements-Installer'
    }
    $releaseUri = "https://api.github.com/repos/$Repository/releases/latest"
    Write-Host "Finding the latest release from $Repository..."
    $release = Invoke-RestMethod -Uri $releaseUri -Headers $headers
    $asset = $release.assets |
        Where-Object { $_.name -match '^oss-cad-suite-windows-x64-[0-9]+\.(exe|tgz)$' } |
        Select-Object -First 1

    if (-not $asset) {
        throw 'The latest OSS CAD Suite release did not contain a recognized Windows x64 archive (.exe or .tgz).'
    }

    $downloadPath = Join-Path $InstallRoot $asset.name
    Write-Host "Downloading $($asset.name) to $downloadPath..."
    Invoke-WebRequest -Uri $asset.browser_download_url -Headers $headers -OutFile $downloadPath -UseBasicParsing

    if ($asset.name.EndsWith('.exe', [StringComparison]::OrdinalIgnoreCase)) {
        Write-Host 'Starting the OSS CAD Suite self-extractor. Approve any Windows security prompt.' -ForegroundColor Yellow
        $process = Start-Process -FilePath $downloadPath -WorkingDirectory $InstallRoot -Wait -PassThru
        if ($process.ExitCode -ne 0) {
            throw "The OSS CAD Suite extractor exited with code $($process.ExitCode)."
        }
    } else {
        $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
        if (-not $tar) {
            throw 'Windows tar.exe is required to extract the current OSS CAD Suite .tgz archive.'
        }
        Write-Host "Extracting $($asset.name) into $InstallRoot..."
        & $tar.Source -xzf $downloadPath -C $InstallRoot
        if ($LASTEXITCODE -ne 0) {
            throw "tar.exe failed to extract OSS CAD Suite (exit code $LASTEXITCODE)."
        }
    }

    if (-not ($yosysCandidates | Where-Object { Test-Path -LiteralPath $_ })) {
        throw "Extraction finished, but $suiteDirectory was not found. Re-run $downloadPath and extract it into $InstallRoot."
    }

    Write-Host "Installed at $suiteDirectory." -ForegroundColor DarkGreen
}

function Configure-WindowsVerilator {
    param(
        [Parameter(Mandatory)] [string]$InstallRoot,
        [Parameter(Mandatory)] [string]$MsysRoot
    )

    Write-Host "`n==> Windows Verilator launcher for Allora" -ForegroundColor Cyan
    $suiteDirectory = Join-Path $InstallRoot 'oss-cad-suite'
    $binDirectory = Join-Path $suiteDirectory 'bin'
    $verilatorBin = Join-Path $binDirectory 'verilator_bin.exe'
    $verilatorExe = Join-Path $binDirectory 'verilator.exe'
    $environmentPs1 = Join-Path $suiteDirectory 'environment.ps1'
    $environmentBat = Join-Path $suiteDirectory 'environment.bat'

    if (-not (Test-Path -LiteralPath $verilatorBin)) {
        throw "Verilator's Windows binary was not found at $verilatorBin."
    }

    Copy-Item -LiteralPath $verilatorBin -Destination $verilatorExe -Force

    $marker = '# Allora FPGA Windows Verilator support'
    $psBlock = @"

$marker
`$env:VERILATOR_ROOT = Join-Path `$env:YOSYSHQ_ROOT 'share\verilator'
`$env:PATH = @('$MsysRoot\ucrt64\bin', '$MsysRoot\usr\bin', `$env:PATH) -join ';'
"@
    if ((Get-Content -Raw -LiteralPath $environmentPs1) -notmatch [regex]::Escape($marker)) {
        Add-Content -LiteralPath $environmentPs1 -Value $psBlock
    }

    $batBlock = @"

REM Allora FPGA Windows Verilator support
set "VERILATOR_ROOT=%YOSYSHQ_ROOT%\share\verilator"
set "PATH=$MsysRoot\ucrt64\bin;$MsysRoot\usr\bin;%PATH%"
"@
    if ((Get-Content -Raw -LiteralPath $environmentBat) -notmatch 'Allora FPGA Windows Verilator support') {
        Add-Content -LiteralPath $environmentBat -Value $batBlock
    }

    $pixbufDirectory = Join-Path $suiteDirectory 'lib\gdk-pixbuf-2.0\2.10.0'
    if (Test-Path -LiteralPath $pixbufDirectory) {
        $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        $grant = "${currentUser}:(OI)(CI)M"
        & icacls.exe $pixbufDirectory /grant $grant /T /C | Out-Null
    }

    Write-Host 'Created verilator.exe and added GNU Make/GCC to the OSS CAD environment.' -ForegroundColor DarkGreen
}

function Set-RuntimeEnvironment {
    param(
        [Parameter(Mandatory)] [string]$InstallRoot,
        [Parameter(Mandatory)] [string]$MsysRoot
    )

    Write-Host "`n==> Configure Allora FPGA command-line tools" -ForegroundColor Cyan
    $suiteDirectory = Join-Path $InstallRoot 'oss-cad-suite'
    $toolPaths = @(
        (Join-Path $suiteDirectory 'bin'),
        (Join-Path $MsysRoot 'ucrt64\bin'),
        (Join-Path $MsysRoot 'usr\bin')
    )
    foreach ($toolPath in $toolPaths) {
        if (-not (Test-Path -LiteralPath $toolPath)) {
            throw "Runtime tool directory not found: $toolPath"
        }
    }

    [Environment]::SetEnvironmentVariable('YOSYSHQ_ROOT', $suiteDirectory, 'User')
    [Environment]::SetEnvironmentVariable('VERILATOR_ROOT', (Join-Path $suiteDirectory 'share\verilator'), 'User')
    $env:YOSYSHQ_ROOT = $suiteDirectory
    $env:VERILATOR_ROOT = Join-Path $suiteDirectory 'share\verilator'

    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $existing = @($userPath -split ';' | Where-Object { $_ })
    $newEntries = @($toolPaths | Where-Object { $existing -notcontains $_ })
    if ($newEntries.Count -gt 0) {
        [Environment]::SetEnvironmentVariable('Path', (($newEntries + $existing) -join ';'), 'User')
    }
    $env:Path = (@($toolPaths) + @($env:Path)) -join ';'
    Write-Host 'Tool locations were added to your user PATH. Restart Allora FPGA after setup.' -ForegroundColor DarkGreen
}

if (-not (Test-Path -LiteralPath $RequirementsFile)) {
    throw "Requirements file not found: $RequirementsFile"
}
$RequirementsFile = (Resolve-Path -LiteralPath $RequirementsFile).Path

if (-not (Test-IsAdministrator)) {
    Write-Host 'Administrator access is needed to install the Windows packages and FPGA toolchain.' -ForegroundColor Yellow
    $elevationArguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -RequirementsFile `"$RequirementsFile`""
    $elevated = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $elevationArguments -Wait -PassThru
    exit $elevated.ExitCode
}

$logPath = Join-Path $scriptDirectory 'install-windows-requirements.log'
try {
    Start-Transcript -LiteralPath $logPath -Force | Out-Null
} catch {
    Write-Warning "Could not start the installation transcript: $($_.Exception.Message)"
}

trap {
    $failure = $_
    Write-Host "`nInstallation failed: $($failure.Exception.Message)" -ForegroundColor Red
    try {
        $failure | Format-List * -Force | Out-File -LiteralPath $logPath -Append -Encoding utf8
        Stop-Transcript | Out-Null
    } catch {
        # Preserve the original failure even if transcript cleanup fails.
    }
    Write-Host "The error log is at: $logPath" -ForegroundColor Yellow
    Read-Host 'Press Enter to close this Administrator window'
    exit 1
}

if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    throw 'winget is required. Install or update Microsoft App Installer from the Microsoft Store, then run this command again.'
}

$requirements = Get-Content -LiteralPath $RequirementsFile |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -and -not $_.StartsWith('#') }

Write-Host 'Installing Allora FPGA Windows requirements...' -ForegroundColor Green

foreach ($line in $requirements) {
    $parts = $line -split '\|', 4
    if ($parts.Count -ne 4) {
        throw "Invalid requirements line: $line"
    }

    $kind = $parts[0]
    $identifier = $parts[1]
    $name = $parts[2]
    $options = $parts[3]

    switch ($kind) {
        'winget' {
            $forceRepair = $false
            if ($identifier -eq 'OpenJS.NodeJS.LTS') {
                $forceRepair = -not (Test-Path -LiteralPath 'C:\Program Files\nodejs\npm.cmd')
            }
            Invoke-WingetInstall -Id $identifier -Name $name -Force:$forceRepair
        }
        'winget-vs' {
            if (Test-VisualStudioCppTools) {
                Write-Host "`n==> $name" -ForegroundColor Cyan
                Write-Host 'C++ build tools are already installed.' -ForegroundColor DarkGreen
            } else {
                Invoke-WingetInstall -Id $identifier -Name $name -Override $options -Force
            }
        }
        'rust-target' {
            Install-RustTarget -Target $identifier
        }
        'msys2-packages' {
            Install-Msys2Packages -MsysRoot $options -Packages $identifier
        }
        'windows-feature' {
            Enable-RequiredWindowsFeature -FeatureName $identifier -Name $name
        }
        'oss-cad' {
            Install-OssCadSuite -Repository $identifier -InstallRoot $options
        }
        'verilator-windows' {
            Configure-WindowsVerilator -InstallRoot $options -MsysRoot $identifier
        }
        'runtime-env' {
            Set-RuntimeEnvironment -InstallRoot $options -MsysRoot $identifier
        }
        default {
            throw "Unknown requirement kind '$kind' in line: $line"
        }
    }
}

Update-ProcessPath

Write-Host "`nInstallation completed." -ForegroundColor Green
Write-Host 'Restart Allora FPGA and open a new PowerShell window to use the newly installed tools.' -ForegroundColor Yellow
Write-Host 'If tools remain unavailable, sign out of Windows and sign back in.' -ForegroundColor Yellow

try {
    Stop-Transcript | Out-Null
} catch {
    # Installation succeeded; inability to close the transcript is non-fatal.
}
