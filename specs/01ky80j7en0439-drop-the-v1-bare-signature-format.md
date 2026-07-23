status: open
evidence: additive
paths: packages/**
outcome: One signature format. The v1 bare-base64 signature container is
  removed from verification; a .sig is an OpenSSH SSHSIG envelope or it does
  not authorize, and the spec lane refuses bare companions. The format only
  ever existed during the pirates dogfood weeks - no customer holds a v1
  signature - and the maintainer declared those historical ranges
  non-re-verifiable. Raw base64 signer KEYS in allowedSigners stay: that is
  config surface and works with envelopes.
acceptance:
- A bare base64 signature no longer authorizes and the verdict names the envelope requirement.
- A bare base64 spec-lane companion is refused.
