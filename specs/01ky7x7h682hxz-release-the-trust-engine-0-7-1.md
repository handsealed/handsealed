status: delivered
evidence: non-additive
paths: packages/** package-lock.json
outcome: Publish 0.7.1 - the patch carrying the fork-point fix for the red
  rule's test-only checkpoint check. Every package is bumped 0.7.0 -> 0.7.1
  with its inter-package ranges; the tag-triggered publish ships the set with
  provenance. No behaviour changes beyond the versions; the engine fix landed
  under its own mandate (#22).
acceptance:
- Every package's version and inter-package dependency range is 0.7.1, so the v0.7.1 tag matches all four and they resolve to each other.
