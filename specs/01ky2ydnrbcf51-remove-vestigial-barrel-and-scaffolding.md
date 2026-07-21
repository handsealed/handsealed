status: delivered
evidence: non-additive
paths: packages/**
outcome: Remove the vestigial engine facts re-export barrel (engine imports the Facts types directly from @handsealed/facts) and the PACKAGE_NAME placeholder constants left over from the empty-package scaffolding, along with their trivial index wiring-tests; the empty verifier main entry is dropped in favour of its bin and reporter subpath.
acceptance:
- engine/src/facts.ts is gone and engine imports the Facts contract directly from @handsealed/facts.
- The PACKAGE_NAME constants and their index wiring-tests are removed from every package.
