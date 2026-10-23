# Persistent user preferences

- Do not send pictures or videos in chat; report results in text.
- When the user says **popup**, use the **Product Information** popup as the reference: a compact glass panel anchored to its trigger, the same unfold animation, outside-click/Escape dismissal, and no page-dimming or page-blurring modal backdrop. Honor both reduced-motion preferences. The user will explicitly specify when a different popup style is wanted; do not default to the Settings modal style.
- See `CONTEXT.md` and `allora-fpga/src/components/ui/README.md` for the shared UI rules and `CONTINUATION.md` for engineering handoffs.
- For a request like “make a new macOS release <version>” or “make a new Windows release <version>,” follow `git_release_workflow.md` and its platform guide. Carry out the branch, commit, push, tag, and tag-push steps, then leave the GitHub release as a draft for the user to publish. Never publish it. Use `main` for macOS; use the documented Windows preview branch and tag flow for Windows. Commit only release-scoped changes with a clear message, and do not create an empty commit when there is nothing to commit.
