# @handsealed/facts

The contract every Handsealed surface shares: the `Facts` interface — the
questions a judge may ask of a repository — and the git value types it speaks
in (`Oid`, `PathChange`, `PatchIdentity`, `RangeDiffEntry`, …).

Zero runtime dependencies, pure types plus one tiny test double. Implement
`Facts` against any backing store (local git, a hosted API, a cache) and every
Handsealed rule runs unchanged on top of it. The reference implementation is
[`@handsealed/facts-git`](https://www.npmjs.com/package/@handsealed/facts-git);
the rules live in [`@handsealed/engine`](https://www.npmjs.com/package/@handsealed/engine).

```sh
npm install @handsealed/facts
```

Error contract: implementations throw only on infrastructure failure, and
callers treat any throw as fail-closed. Semantic absences (file missing at a
ref, no merge base) are values, never exceptions.

## In-memory double

```ts
import { memoryFacts } from "@handsealed/facts/memory";

const facts = memoryFacts({
  changes: [{ path: "src/a.ts", kind: "modified" }],
  files: { "h:src/a.ts": "export const a = 2;\n" },
});
```

Range-keyed inputs use `${base}..${head}`; ref-keyed files use `${ref}:${path}`.
Anything unconfigured throws, per the contract.

Part of [Handsealed](https://github.com/handsealed/handsealed). Apache-2.0.
