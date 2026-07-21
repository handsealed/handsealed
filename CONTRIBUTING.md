# Contributing

Early days — the engine is pre-alpha and moving fast; issues are welcome, large unsolicited PRs may have a hard time landing until the rules stabilize.

## Ground rules

- **Conventional commits are mandatory** and CI-enforced: `type(scope)?: subject` with type one of `feat fix chore docs test refactor perf build ci style revert`.
- **Licensing:** by submitting a contribution you agree it is licensed under [Apache-2.0](LICENSE) (License §5). No CLA.
- **Dependency policy:** runtime dependencies in the engine core are effectively frozen (currently: `yaml` only). Adding one is a reviewed design decision, not a convenience — this repository's dependency tree is part of the product's trust argument.
- Tests use `node:test`; deterministic golden fixtures are the house style. New rules land with positive, negative, and adversarial fixtures.

## Development

Node >= 22 · `npm ci` · `npm test` · `npm run lint` · `npm run fmt`.
