status: open
evidence: additive
paths: packages/**
outcome: The verdict stops taking test evidence on faith. verify accepts
  attested suite results and gains an execution rule, so the judge verifies
  that suites ran clean at the judged head and that an additive mandate's
  acceptance bullets were actually executed as passing cases carrying their
  markers in the case names. Without results nothing changes.
acceptance:
- With attested suite results the verdict gains an execution rule that fails on any failing case and passes only when every attested suite ran clean.
- An additive mandate's acceptance bullets must each be executed, meaning a passing attested case carries the bullet marker in its name, and a comment-only marker fails.
- Exempt mandates owe no execution, and verify without results keeps the verdict exactly as today.
