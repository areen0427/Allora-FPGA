# Windows preview release

Windows work is isolated on `codex/windows-preview`. The macOS `v*` release
workflow is unchanged. A push to this branch builds an NSIS installer as a
GitHub Actions artifact. A `windows-v*` tag builds a **draft prerelease** with
the installer and `allora-fpga-windows-requirements.zip` attached. Review and
publish the draft manually after testing.

This is an experimental build. The app has launched on Windows, but project
creation and other native workflows have not yet been verified end to end. Do
not use it for irreplaceable projects.

## Install on Windows

1. Download and run the Windows `.exe` NSIS installer from the draft release.
   Tauri's installer handles WebView2.
2. Download and extract `allora-fpga-windows-requirements.zip` if you want FPGA
   simulation, synthesis, build, or Git publishing features. The same files are
   included inside the installed app's `resources\windows` directory.
3. From PowerShell, run:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\install-windows-requirements.ps1"
   ```

   The script prompts for administrator access, installs Git, MSYS2 Make/GCC,
   and OSS CAD Suite, and adds the tool directories to the user's environment.
   Close and reopen Allora FPGA when it finishes. Sign out and back in if a
   newly installed tool is not discovered.

The setup downloads current third-party packages at run time; they are **not**
embedded in the app. Rust, Node.js, and Visual Studio Build Tools are only
needed to build Allora from source. For a local developer machine, run the same
script with `-RequirementsFile .\windows-build-requirements.txt` instead.
Board-specific USB/JTAG drivers are not installed automatically.

## Create a draft prerelease

After the branch build succeeds, tag the tested commit with a name such as
`windows-v0.1.0-preview.1` and push that tag. This name does not match the
macOS `v*` trigger. The Windows workflow creates a draft prerelease, so it
will not be public until its assets and behavior have been reviewed.
