status: open
evidence: non-additive
paths: packages/** package-lock.json
outcome: Publish 0.8.0 - the breaking release accumulating the cleanup arc:
  the v1 bare signature container is gone (SSHSIG is the one format), the
  unused verificationSurface key and the spec sign verb are removed, and the
  vocabulary is aligned (mandate new, parseMandate, the mandate lane, verify
  defaulting to origin/main..HEAD). Every package is bumped 0.7.1 -> 0.8.0
  with its inter-package ranges; the tag-triggered publish ships the set with
  provenance. Engine changes landed under their own mandates (#25, #24, #26).
acceptance:
- Every package's version and inter-package dependency range is 0.8.0, so the v0.8.0 tag matches all four and they resolve to each other.
