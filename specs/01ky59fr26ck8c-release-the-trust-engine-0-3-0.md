status: open
evidence: non-additive
paths: packages/** package-lock.json
outcome: Publish 0.3.0 — the release carrying signed one-shot delivery (a mandate
  created delivered with a valid code-owner signature authorizes in one change).
  Every package is bumped 0.2.0 → 0.3.0 with its inter-package ranges, so the
  tag-triggered publish ships the whole set with provenance. No behaviour changes
  beyond the versions; the engine change landed under its own mandate (#11).
acceptance:
- Every package's version and inter-package dependency range is 0.3.0, so the v0.3.0 tag matches all four and they resolve to each other.
