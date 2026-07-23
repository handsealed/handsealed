status: delivered
evidence: additive
paths: packages/**
outcome: Fail-first proof and signer identity become durable artifacts. A
  committed red receipt (specs/<slug>.red.json) records that a mandate's
  acceptance cases failed at a test-only checkpoint, and a new red rule
  verifies receipt coverage, checkpoint shape, and marker-file freeze,
  activated by the config key redRequired. Signatures move to the OpenSSH
  SSHSIG envelope (namespace handsealed) with self-identifying keys and room
  for multiple signers; bare v1 signatures and raw signer keys stay valid
  forever.
acceptance:
- A mandate signed with an SSHSIG envelope over its commitments verifies under an allowed signer and the verdict names that signer.
- A bare v1 base64 signature and a raw base64 signer key keep authorizing exactly as before.
- A red receipt whose marked cases all failed at a reachable test-only checkpoint with frozen marker files passes the red rule, while an edited marker file or a missing receipt under redRequired additive fails it.
- The red helper writes a receipt carrying only the marked failing cases and refuses a marked case that passed at the checkpoint.
