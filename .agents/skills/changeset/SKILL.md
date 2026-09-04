# Changeset

Use this skill for release-relevant pull requests and changelog entries.

1. Run `pnpm changeset` and select `maintainers.space`.
2. Choose `patch` for fixes and internal improvements, `minor` for backward-compatible user-facing features, and `major` only for an intentionally reviewed breaking release.
3. Write for maintainers using the site, not for reviewers of the implementation. Begin with a present-tense verb such as Adds, Fixes, Improves, Removes or Updates.
4. Name the visible behavior and why it matters. Keep a patch entry to one line unless migration or usage guidance is necessary.
5. Do not put issue mechanics, test details, filenames, commit hashes or a release codename in the entry.

`@changesets/changelog-github` adds pull-request and contributor links during versioning, so do not duplicate them manually. The release versioning script assigns every minor version a deterministic space-themed codename and adds it to `CHANGELOG.md`. Release commits and pull-request titles remain semantic and do not include the codename.

Before finishing, run `pnpm changeset:status` to validate all pending entries.
