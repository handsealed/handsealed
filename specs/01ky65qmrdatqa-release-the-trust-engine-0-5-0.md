status: delivered
evidence: non-additive
paths: packages/** package-lock.json
outcome: Publish 0.5.0 — the release carrying one-command signing (handsealed
  sign). Every package is bumped 0.4.0 → 0.5.0 with its inter-package ranges,
  so the tag-triggered publish ships the whole set with provenance. No
  behaviour changes beyond the versions; the CLI change landed under its own
  mandate (#15).
acceptance:
- Every package's version and inter-package dependency range is 0.5.0, so the v0.5.0 tag matches all four and they resolve to each other.
