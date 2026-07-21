status: open
evidence: additive
paths: packages/** package.json scripts/**
outcome: The delivery surface gets the polish a stranger needs — the CLI can
  surface the re-approval fact against a previously approved revision, a spec
  written with Windows line endings fails with one clear message instead of a
  cascade of confusing order errors, workspace bin entries stay executable
  after every rebuild, and each published package carries a README that says
  what it is.
acceptance:
- Running verify with --approved appends the re-approval fact to the verdict.
- A spec containing CRLF line endings is rejected with a single clear issue.
- Every workspace bin target is executable after a root build.
