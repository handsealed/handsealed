# @handsealed/verifier

The Handsealed CLI. Every verdict is replayable offline against a clone —
don't trust us, verify.

```sh
npm install -g @handsealed/verifier
handsealed verify --base <rev> --head <rev>
```

Commands:

- `verify --base <rev> --head <rev> [--approved <rev>] [--repo <dir>] [--json]`
  — replay the offline judge over `base..head`. Exit 0 pass, 1 fail, 2 usage.
  With `--approved`, the re-approval fact states exactly what moved since the
  head you last approved ("only the base moved" vs. a per-file delta).
- `spec new <words...>` — mint an open mandate with a sortable,
  collision-proof filename.
- `evidence run` — run every suite configured in `.handsealed.yml` and
  collect result files. Red tests are evidence, not errors; missing evidence
  fails closed.
- `results emit-node [--suite <name>] [--out <file>] [--] [paths...]` — run
  `node:test` with the Handsealed reporter attached
  (`@handsealed/verifier/reporter`), preserving human output while writing
  the results file.

The CLI is a thin shell over
[`@handsealed/engine`](https://www.npmjs.com/package/@handsealed/engine) +
[`@handsealed/facts-git`](https://www.npmjs.com/package/@handsealed/facts-git):
its JSON output is byte-identical to calling the library `judge()` yourself.

Part of [Handsealed](https://github.com/handsealed/handsealed). Apache-2.0.
