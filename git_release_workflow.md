# Git release workflow

## Prompt-driven release procedure

When the user asks to make a macOS or Windows release and supplies a version,
perform the platform steps below through the tag push. Inspect the working tree
first, preserve unrelated changes, and commit only the changes intended for the
release. Do not publish the GitHub release; the user publishes the draft.

### macOS

Use `main` and an annotated `vX.Y.Z` tag (for example, `v0.3.7`). Bring only the
intended release changes to `main`, review the staged diff, commit them with a
message such as `chore(release): prepare v0.3.7`, then push `main`. If there are
no release changes to commit, do not make an empty commit. After `main` is
pushed, create and push the annotated version tag:

```bash
git switch main
git status --short
git add <reviewed-release-paths>
git diff --cached
git commit -m "chore(release): prepare v0.3.7"
git push origin main
git tag -a v0.3.7 -m "Release v0.3.7"
git push origin v0.3.7
```

The `v*` tag starts the Apple Silicon DMG workflow. It creates a draft release;
confirm the build and draft assets are ready, then leave publication to the user.
The tag supplies the app version in CI, so do not bump local manifests just to
make a release.

### Windows

Windows currently uses the `codex/windows-preview` branch for its build and
`windows-vX.Y.Z-preview.N` for a release tag (for example,
`windows-v0.1.0-preview.3`). Commit only the intended Windows release changes on
that branch with a message such as
`chore(release): prepare Windows preview 0.1.0-preview.3`, push the branch, and
wait for its artifact build to succeed. Then tag the tested commit and push the
tag:

```bash
git switch codex/windows-preview
git status --short
git add <reviewed-release-paths>
git diff --cached
git commit -m "chore(release): prepare Windows preview 0.1.0-preview.3"
git push origin codex/windows-preview
# After the branch artifact build succeeds:
git tag -a windows-v0.1.0-preview.3 -m "Windows preview v0.1.0-preview.3"
git push origin windows-v0.1.0-preview.3
```

The Windows tag starts a separate draft prerelease workflow that attaches the
x64 NSIS installer and `allora-fpga-windows-requirements.zip`. Check that both
assets are attached and leave the draft unpublished for the user. The tag
supplies the app version in CI. If the user gives only a base Windows version,
inspect existing Windows preview tags and use the next unused `preview.N` value.

## macOS Apple Silicon release

The GitHub Actions workflow in `.github/workflows/release-macos-apple-silicon.yml` runs when a `v*` tag is pushed. It reads the version from the tag, builds the Apple Silicon DMG, and creates a **draft** GitHub release with generated release notes. Builds use Node.js 24, `npm ci`, and Cargo's locked dependency resolution. Follow the macOS procedure above to commit and push `main`, then create and push the tag.

After pushing, check the **Release Apple Silicon app** workflow and review the draft's generated notes and DMG asset. Leave the release as a draft for the user to publish.

The workflows build the tagged source, including the workflow and version script
stored in that commit. The version script synchronizes npm, Tauri, and Cargo
versions in the runner; local development manifests need not be bumped manually.
Its LF/CRLF regression tests run before version synchronization on both platforms.

## Retry a failed release

For a transient failure, use **Re-run failed jobs** on the original run. Both
workflows also support **Run workflow** on an existing release tag (the workflow
must be available on the default branch for GitHub to expose manual dispatch).
macOS dispatch rejects branches; Windows branch dispatch creates a test artifact.
For example, once these workflow changes are available:

```bash
gh workflow run release-macos-apple-silicon.yml --ref v0.3.7
gh workflow run release-windows-preview.yml --ref windows-v0.1.0-preview.3
```

If the fix changes repository files, commit it and create a **new tag** containing
the fix. Rerunning an old tag still uses its old source; it cannot pick up a
workflow or script fix from a later commit. Do not move an existing release tag.
Runs for the same workflow/ref are serialized to avoid concurrent draft updates.
Review existing draft assets after a retry before publishing.

## Windows preview release

Windows uses a separate draft prerelease workflow. Follow [Windows preview release](WINDOWS_RELEASE.md); its tag format is `windows-vX.Y.Z-preview.N`, for example:

```bash
git tag -a windows-v0.1.0-preview.2 -m "Windows preview v0.1.0-preview.2"
git push origin windows-v0.1.0-preview.2
```

Both examples above are instructions only; creating and pushing a tag triggers a real release workflow.
