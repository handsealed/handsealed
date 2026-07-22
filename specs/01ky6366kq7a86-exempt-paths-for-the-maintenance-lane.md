status: open
evidence: additive
paths: packages/**
outcome: Trivia stops needing a signature. The config gains optional
  exemptPaths globs (docs, notes, repo config) read at base. A change touching
  only exempt paths classifies as the maintenance lane and needs no mandate;
  exempt files riding an implementation change are outside the scope ceiling
  and outside evidence-shape counting, while the .github fence still refuses
  implementation changes. Without exemptPaths nothing changes.
acceptance:
- A change touching only exempt paths per the base config classifies as the maintenance lane and passes with no mandate.
- Exempt files riding an implementation change pass the scope ceiling and do not count toward the evidence shape, while a .github rider still fails the fence.
- A config without exemptPaths behaves exactly as before.
