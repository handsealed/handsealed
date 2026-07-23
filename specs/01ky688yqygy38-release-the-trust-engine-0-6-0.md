status: open
evidence: non-additive
paths: packages/** package-lock.json
outcome: Publish 0.6.0 — the release carrying evidence execution attestation
  (verify --results). Every package is bumped 0.5.0 → 0.6.0 with its
  inter-package ranges, so the tag-triggered publish ships the whole set with
  provenance. No behaviour changes beyond the versions; the engine change
  landed under its own mandate (#18).
acceptance:
- Every package's version and inter-package dependency range is 0.6.0, so the v0.6.0 tag matches all four and they resolve to each other.
