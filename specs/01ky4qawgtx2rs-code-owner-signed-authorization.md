status: open
evidence: additive
paths: packages/**
outcome: A new authorization rule closes the self-authorization hole. An
  implementation change is authorized only by a code owner's Ed25519 signature
  over the mandate's commitments — its slug, evidence class, paths, and
  acceptance — carried in a sibling `specs/<slug>.sig` and verified offline
  against the `allowedSigners` read from the config at base. The signature omits
  status, so it survives the open-to-delivered flip yet rejects any tampering
  with the deal after signing; an agent cannot forge a code owner's key, so it
  can no longer author and flip its own mandate.
acceptance:
- A flip whose sibling signature validly covers the mandate's commitments, by a key in the base config's allowedSigners, earns an authorized verdict.
- A flip with no signature, a malformed or invalid signature, or a signature by a key absent from allowedSigners is rejected as unauthorized.
- The allowedSigners list is read from the config at base, so a change that adds a signer cannot authorize itself.
- The signed commitments exclude status but include acceptance and paths, so altering the acceptance or scope after signing invalidates the authorization.
