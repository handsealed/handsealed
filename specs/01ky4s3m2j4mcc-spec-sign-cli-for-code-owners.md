status: open
evidence: additive
paths: packages/**
outcome: A code owner can produce the signature the authorization rule verifies.
  `handsealed keygen` mints an Ed25519 keypair — a base64 raw public key to paste
  into `.handsealed.yml` allowedSigners, and a PKCS8 private key the owner keeps
  and never commits. `handsealed spec sign <slug> --key <file>` signs the
  mandate's commitments with that private key and writes `specs/<slug>.sig`. The
  engine's authorization rule accepts a signature the CLI produced, closing the
  loop from key to verdict.
acceptance:
- keygen mints an Ed25519 keypair, returning a base64 raw public key for allowedSigners and a PKCS8 private key.
- spec sign writes specs/<slug>.sig — an Ed25519 signature over the mandate's commitments — and refuses an invalid or missing mandate.
- A signature produced by spec sign is accepted by the engine's authorization rule for a signer holding the matching public key.
