status: open
evidence: additive
paths: packages/**
outcome: Signing stops being a copy-paste ceremony. A new handsealed sign verb
  discovers the branch's unsigned mandates, renders the commitments a code
  owner is about to sign, confirms, and signs with the conventional key path,
  writing sibling sig files; commit and push flags land them on the branch so
  git is the transport in both directions.
acceptance:
- sign discovers the branch's unsigned mandates and renders their commitments for review before anything is signed.
- sign uses the conventional key path by default and writes sibling sig files the authorization rule accepts.
- sign with commit and push lands the signatures on the branch, and non-interactive runs require an explicit yes flag.
