# Git release workflow

## macOS Apple Silicon release

The GitHub Actions workflow in `.github/workflows/release-macos-apple-silicon.yml` runs when a `v*` tag is pushed. It reads the version from the tag, builds the Apple Silicon DMG, and creates a **draft** GitHub release with generated release notes. Review the draft and publish it on GitHub after the build succeeds.

Run these commands from the repository root after making the release change. Replace the commit message and `0.3.1` with the appropriate values. The tag is authoritative for the app and installer version.

```bash
git add .
git commit -m "Your commit message"
git push origin main
git tag -a v0.3.1 -m "Release v0.3.1"
git push origin v0.3.1
```

Pushing the tag starts the GitHub Actions workflow, which checks out that commit, sets the app version from the tag, builds the DMG, and creates the draft release.

After pushing, check the **Release Apple Silicon app** workflow in GitHub Actions. When it succeeds, open the draft release, review the generated notes and DMG asset, then publish the release.

## Windows preview release

Windows uses a separate draft prerelease workflow. Follow [Windows preview release](WINDOWS_RELEASE.md); its tag format is `windows-vX.Y.Z-preview.N`, for example:

```bash
git tag -a windows-v0.1.0-preview.2 -m "Windows preview v0.1.0-preview.2"
git push origin windows-v0.1.0-preview.2
```

Both examples above are instructions only; creating and pushing a tag triggers a real release workflow.
