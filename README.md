# Handsealed

**Chain of custody for code.** Two human clicks — "do this" and "ship it" — with everything between them machine-verified, and every proof stored in your own repo, replayable offline forever.

> Machines make the change; a human hand seals it — and the seal is verifiable forever.

**Status: pre-alpha.** This repository is the open-core trust engine — the rules, the git facts adapter, and the offline verifier. Nothing here is ready for use yet; the first milestone is the engine itself, dogfooded on a real production repository before anyone else touches it.

## Packages

| Package | What it is |
| --- | --- |
| `@handsealed/engine` | The deterministic rules: lanes, mandate binding, scope ceilings, evidence classes, verdicts. No model in the trust path — ever. |
| `@handsealed/facts-git` | The single git facts implementation (plumbing-only) shared by the CLI, self-hosted CI, and the hosted service. |
| `@handsealed/verifier` | The CLI: replay every verdict offline against a bare clone. Don't trust us — verify. |

## Principles

1. The two human seals are never automated, reduced, or delegated.
2. Mechanical, never model-judged: deterministic rules, offline-verifiable.
3. Open-core: this engine is the whole trust argument, in the open.
4. Zero vendor state: every proof lives in your repository.
5. The vendor never executes your code.

## Development

Node >= 22. `npm ci`, then `npm test` (builds and runs all package tests) and `npm run lint`. Conventional commits are mandatory and CI-enforced.

## License

[Apache-2.0](LICENSE). Contributions are accepted under the same license (see [CONTRIBUTING.md](CONTRIBUTING.md)). "Handsealed" is a trade name of the project; the license grants no trademark rights.
