import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { evidenceRun, renderEvidenceSummary } from "./evidence.js";

const results = (suite: string, outcomes: string[]): string =>
  JSON.stringify({
    version: 1,
    suite,
    cases: outcomes.map((outcome, i) => ({ name: `case ${i + 1}`, outcome })),
  });

function fixture(config: string, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "handsealed-evidence-"));
  writeFileSync(join(dir, ".handsealed.yml"), config);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

test("runs every suite, tolerates red, validates and collects results", async () => {
  const config = `version: 1
suites:
  green:
    run: cp pre-green.json green.json
    results: green.json
  red:
    run: "cp pre-red.json red.json; exit 1"
    results: red.json
testRoots:
  - test
`;
  const dir = fixture(config, {
    "pre-green.json": results("green", ["pass", "pass"]),
    "pre-red.json": results("red", ["fail"]),
  });
  try {
    const outcome = await evidenceRun(dir);
    assert.equal(outcome.ok, true, JSON.stringify(outcome));
    assert.deepEqual(
      outcome.runs.map((r) => [r.suite, r.exitCode, r.cases]),
      [
        ["green", 0, 2],
        ["red", 1, 1],
      ],
    );
    const collected = readFileSync(join(dir, ".handsealed/results/red.json"), "utf8");
    assert.equal(JSON.parse(collected).suite, "red");
    assert.match(renderEvidenceSummary(outcome), /evidence collected/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fail-closed: a missing results file fails the run even when tests exit 0", async () => {
  const config = `version: 1
suites:
  silent:
    run: "true"
    results: never-written.json
testRoots:
  - test
`;
  const dir = fixture(config, {});
  try {
    const outcome = await evidenceRun(dir);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.runs[0]?.problem, "results file missing");
    assert.match(renderEvidenceSummary(outcome), /failing closed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fail-closed: an unparseable results file fails the run", async () => {
  const config = `version: 1
suites:
  broken:
    run: cp pre-broken.json broken.json
    results: broken.json
testRoots:
  - test
`;
  const dir = fixture(config, { "pre-broken.json": "{nope" });
  try {
    const outcome = await evidenceRun(dir);
    assert.equal(outcome.ok, false);
    assert.match(outcome.runs[0]?.problem ?? "", /results file invalid/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a missing or invalid config throws (infrastructure failure)", async () => {
  const empty = mkdtempSync(join(tmpdir(), "handsealed-evidence-"));
  try {
    await assert.rejects(() => evidenceRun(empty), /no \.handsealed\.yml/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
  const bad = fixture("version: 2\n", {});
  try {
    await assert.rejects(() => evidenceRun(bad), /invalid/);
  } finally {
    rmSync(bad, { recursive: true, force: true });
  }
});
