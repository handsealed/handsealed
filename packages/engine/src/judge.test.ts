import { strict as assert } from "node:assert";
import { test } from "node:test";
import { memoryFacts } from "@handsealed/facts/memory";
import type { PathChange } from "@handsealed/facts";
import { judge } from "./judge.js";

const OPEN = `status: open\nevidence: additive\npaths: src/**\noutcome: Do the thing.\nacceptance:\n- It works.\n`;
const DELIVERED = OPEN.replace("status: open", "status: delivered");
const CONFIG = `version: 1\nsuites:\n  scripts:\n    run: npm test\n    results: r.json\ntestRoots:\n  - test\n`;
const FLIP = "specs/01k0h3v8-do-thing.md";

const factsFor = (changes: PathChange[], files: Record<string, string>) =>
  memoryFacts({ changes, files });

test("implementation lane composes lane, binding, ceiling, and evidence", async () => {
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "src/a.ts", kind: "modified" },
      { path: "test/a.test.ts", kind: "added" },
    ],
    { [`b:${FLIP}`]: OPEN, [`h:${FLIP}`]: DELIVERED, "h:.handsealed.yml": CONFIG },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  assert.deepEqual(
    verdicts.rules.map((r) => r.rule),
    ["lane", "binding", "ceiling", "evidence"],
  );
});

test("a missing config skips ceiling and evidence, loudly", async () => {
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "src/a.ts", kind: "modified" },
    ],
    { [`b:${FLIP}`]: OPEN, [`h:${FLIP}`]: DELIVERED },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  assert.deepEqual(
    verdicts.rules.map((r) => r.rule),
    ["lane", "binding", "config"],
  );
  assert.match(verdicts.rules[2]?.findings[0]?.message ?? "", /checks skipped/);
});

test("an invalid config fails closed", async () => {
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "src/a.ts", kind: "modified" },
    ],
    {
      [`b:${FLIP}`]: OPEN,
      [`h:${FLIP}`]: DELIVERED,
      "h:.handsealed.yml": "version: 2\n",
    },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "fail");
  assert.equal(
    verdicts.rules.some((r) => r.rule === "config" && r.status === "fail"),
    true,
  );
});

test("spec lane runs spec validation only", async () => {
  const facts = factsFor([{ path: FLIP, kind: "added" }], { [`h:${FLIP}`]: OPEN });
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  assert.deepEqual(
    verdicts.rules.map((r) => r.rule),
    ["lane", "spec-lane"],
  );
});

test("an amendment (lone modified spec, still open) stays in the spec lane", async () => {
  const amended = OPEN.replace("Do the thing.", "Do the amended thing.");
  const facts = factsFor([{ path: FLIP, kind: "modified" }], { [`h:${FLIP}`]: amended });
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  assert.deepEqual(
    verdicts.rules.map((r) => r.rule),
    ["lane", "spec-lane"],
  );
});

test("a flip-only delivery (the exempt shape) routes to the implementation lane", async () => {
  const exemptOpen = OPEN.replace("evidence: additive", "evidence: exempt").replace(
    "paths: src/**\n",
    "",
  );
  const exemptDelivered = exemptOpen.replace("status: open", "status: delivered");
  const facts = factsFor([{ path: FLIP, kind: "modified" }], {
    [`b:${FLIP}`]: exemptOpen,
    [`h:${FLIP}`]: exemptDelivered,
    "h:.handsealed.yml": CONFIG,
  });
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  assert.deepEqual(
    verdicts.rules.map((r) => r.rule),
    ["lane", "binding", "ceiling", "evidence"],
  );
  assert.match(verdicts.rules[0]?.findings[0]?.message ?? "", /flip-only change routed/);
});

test("maintenance lane is lane-only", async () => {
  const facts = factsFor([{ path: ".github/workflows/ci.yml", kind: "modified" }], {});
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  assert.deepEqual(
    verdicts.rules.map((r) => r.rule),
    ["lane"],
  );
});
