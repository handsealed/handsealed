status: delivered
evidence: non-additive
paths: packages/**
outcome: The engine and adapter are simplified and type-strengthened with no behavior change — immutable (readonly) public shapes, a discriminated binding result, typed rule ids, a const-generic type guard replacing casts, named regex capture groups in the git adapter, and clearer lane semantics — pinned unchanged by the existing suites.
acceptance:
- All existing suites pass with the same test count as before the refactor.
- Public engine types are readonly and the binding result is a discriminated union.
