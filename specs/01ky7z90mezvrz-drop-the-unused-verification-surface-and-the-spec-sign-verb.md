status: open
evidence: additive
paths: packages/** .handsealed.yml
outcome: Two vestiges go. The verificationSurface config key was parsed,
  typed, and configured but consumed by no rule since the formats froze -
  speculative surface that never earned a judge. The spec sign CLI verb is
  subsumed by the sign verb (which discovers, renders commitments, confirms,
  and delegates to the same signer); one command, one way to sign. The
  internal signing function stays - sign uses it.
acceptance:
- The config parser refuses verificationSurface as an unknown key.
- The CLI no longer offers spec sign and its usage points signing at the sign verb.
