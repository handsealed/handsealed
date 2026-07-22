status: open
evidence: additive
paths: packages/**
outcome: A signed mandate delivers in one change. A mandate created directly as
  delivered, carrying a valid code-owner signature over its commitments,
  authorizes the change it rides in — collapsing the create-then-flip two-step
  into a single pull request while keeping the signature as the only
  authorization anchor. Unsigned one-shot shapes are refused fail-closed.
acceptance:
- A change that creates a mandate as delivered with a valid code-owner signature, alongside in-ceiling product and test changes, passes the judge end-to-end.
- One-shot shapes without a valid signature are refused fail-closed, whether the signature is missing or invalid, no allowedSigners are configured, or no config exists at base.
- Signature companions are recognized, so the spec lane accepts specs sig files and a one-shot mandate's own signature is exempt from its scope ceiling.
