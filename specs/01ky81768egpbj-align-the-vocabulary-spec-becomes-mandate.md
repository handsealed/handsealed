status: open
evidence: additive
paths: packages/** .gitignore
outcome: The product sells mandates; the code now says so. The user-facing
  spec vocabulary becomes mandate - the CLI mints with mandate new, the
  engine exports parseMandate/printMandate/Mandate and the mandate lane, and
  every refusal message names mandates. The specs/ directory keeps its name
  (mandates are specs made binding - the on-disk contract stays). Riders:
  verify defaults to judging origin/main..HEAD, stale docstrings drop their
  spec-sign and v1/v2 references, and the engine ignores its own generated
  .handsealed/ results.
acceptance:
- The engine exports the mandate vocabulary including parseMandate and the mandate lane rule.
- The CLI mints with mandate new and the spec verb is gone.
- verify without flags judges origin/main..HEAD instead of demanding them.
