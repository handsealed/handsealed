status: open
evidence: additive
paths: packages/**
outcome: The judge closes two adversarial holes and activates a dormant rule — spec-lane changes may never reopen delivered mandates, the judging config is read at base so a change cannot edit its own rulebook, and additive mandates must claim their acceptance bullets via markers in changed test files.
acceptance:
- A spec-lane change that sets a delivered mandate back to open is rejected.
- The judge reads the config at base, flags config modifications, and fails additive mandates with unclaimed acceptance bullets.
