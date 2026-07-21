# @handsealed/engine

The offline judge: every Handsealed rule as pure computation over the
[`Facts`](https://www.npmjs.com/package/@handsealed/facts) contract. No git,
no filesystem, no network — the same composition runs in a CLI, a CI job, or
a serverless worker, and always returns the same verdict for the same range.

```sh
npm install @handsealed/engine
```

```ts
import { judge } from "@handsealed/engine";
import { createGitFacts } from "@handsealed/facts-git";

const verdicts = await judge(createGitFacts("."), baseSha, headSha);
console.log(verdicts.overall); // "pass" | "fail"
```

What it holds:

- **Formats** — the frozen mandate grammar (`parseSpec`/`printSpec`), the
  `.handsealed.yml` config, and the `handsealed-results.json` contract.
- **Rules** — lane classification, mandate binding (exactly one byte-clean
  status flip), scope ceiling, evidence class, acceptance markers
  (`[slug#n]`), suite cardinality, the re-approval fact, and revert checks.
- **Verdicts** — `pass` / `fail` / `info` / `attention` per rule, with
  deterministic markdown and stable JSON rendering.

The judging config is read at the _base_ commit, so a change can never edit
its own rulebook; delivered mandates are immutable history and can never be
reopened.

Part of [Handsealed](https://github.com/handsealed/handsealed). Apache-2.0.
