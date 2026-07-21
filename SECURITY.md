# Security Policy

Handsealed is a trust product; security reports are treated as first-class work.

## Reporting a vulnerability

Email **security@handsealed.com**. Please include a reproduction if you can. You will receive an acknowledgment within 72 hours and a status update at least weekly until resolution.

Please do not open public issues for suspected vulnerabilities.

## Scope notes

- The packages in this repository are the open-core trust engine. Anything that could make the engine render a wrong verdict — a rule bypass, a patch-identity confusion, a parsing ambiguity in spec or config files — is in scope and treated as severe.
- Supply-chain reports (dependency, build, or publish pipeline) are in scope. The engine deliberately keeps a near-zero runtime dependency tree so that audits stay tractable.
