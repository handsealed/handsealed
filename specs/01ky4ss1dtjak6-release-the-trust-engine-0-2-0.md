status: open
evidence: non-additive
paths: packages/** package-lock.json
outcome: Publish 0.2.0 — the first release carrying code-owner signed
  authorization. Every package is bumped 0.1.0 → 0.2.0 with its inter-package
  ranges, so the tag-triggered publish ships the whole set with provenance. No
  behaviour changes beyond the versions; the engine and CLI were delivered under
  their own mandates (#8, #9).
acceptance:
- Every package's version and inter-package dependency range is 0.2.0, so the v0.2.0 tag matches all four and they resolve to each other.
