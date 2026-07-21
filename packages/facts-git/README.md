# @handsealed/facts-git

The git adapter for the
[`Facts`](https://www.npmjs.com/package/@handsealed/facts) contract:
plumbing-only (`diff-tree`, `cat-file`, `patch-id --stable`, `range-diff`,
`merge-tree --write-tree`) against any clone — bare clones included, since
verification never needs a working tree.

```sh
npm install @handsealed/facts-git
```

```ts
import { createGitFacts } from "@handsealed/facts-git";

const facts = createGitFacts("/path/to/clone");
const changes = await facts.pathsChanged(baseSha, headSha);
```

Design notes: every revision is passed after `--end-of-options`; rename and
copy detection is on (`-M -C`); patch-ids are conservative — hunk-less chunks
(binary or mode-only) get a content-hash fallback so distinct content can
never compare "unchanged."

## Test harness

`@handsealed/facts-git/testing` ships the real-repo fixture harness used by
the project's own golden suite: `createRepo()` builds throwaway repositories
with pinned identity and dates, so identical scripts produce identical oids.
Adapter implementers get it for free.

Part of [Handsealed](https://github.com/handsealed/handsealed). Apache-2.0.
