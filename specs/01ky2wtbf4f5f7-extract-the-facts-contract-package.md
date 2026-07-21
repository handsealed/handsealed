status: delivered
evidence: additive
paths: packages/** package-lock.json
outcome: The Facts interface and its git value types move into a new zero-dependency @handsealed/facts package that engine and facts-git both depend on, fixing the inverted dependency where the low-level git adapter imported from the high-level engine; the package also ships an in-memory Facts double that replaces the duplicated test stubs.
acceptance:
- A new @handsealed/facts package holds the Facts interface and exports an in-memory double at @handsealed/facts/memory.
- facts-git depends on @handsealed/facts and no longer on @handsealed/engine.
