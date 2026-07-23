status: delivered
evidence: additive
paths: packages/**
outcome: The red rule's test-only checkpoint check diffs from the fork point
  (the merge base of the judged base and the checkpoint), not from the base
  tip. When the base branch advances after a checkpoint is cut, the old
  direct diff wrongly swept the base's new commits into the checkpoint's
  changes and failed a valid receipt with "must be test-only" - hit live by
  the first red-attested pirates delivery once an unrelated fix merged to
  main mid-flight.
acceptance:
- A valid receipt still verifies after the base advances past the checkpoint's fork point.
