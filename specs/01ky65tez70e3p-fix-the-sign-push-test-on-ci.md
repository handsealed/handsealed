status: open
evidence: additive
paths: packages/**
outcome: The sign verb's push e2e passes on any runner. The fixture pins its
  branch name to main explicitly, so the test no longer depends on the
  runner's init.defaultBranch and the bare git push refusal under
  push.default simple disappears.
acceptance:
- The commitAndPush e2e pins its branch name and passes regardless of the runner's default branch.
