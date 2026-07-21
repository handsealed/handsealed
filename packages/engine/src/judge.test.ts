import { strict as assert } from "node:assert";
import { test } from "node:test";
import { memoryFacts } from "@handsealed/facts/memory";
import type { PathChange } from "@handsealed/facts";
import { judge } from "./judge.js";

const SLUG = "01k0h3v8-do-thing";
const OPEN = `status: open\nevidence: additive\npaths: src/**\noutcome: Do the thing.\nacceptance:\n- It works.\n`;
const DELIVERED = OPEN.replace("status: open", "status: delivered");
const CONFIG = `version: 1\nsuites:\n  scripts:\n    run: npm test\n    results: r.json\ntestRoots:\n  - test\n`;
const FLIP = `specs/${SLUG}.md`;
const MARKED_TEST = `test("[${SLUG}#1] it works", () => {});\n`;

const factsFor = (changes: PathChange[], files: Record<string, string>) =>
  memoryFacts({ changes, files });

test("implementation lane composes lane, binding, ceiling, evidence, and acceptance", async () => {
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "src/a.ts", kind: "modified" },
      { path: "test/a.test.ts", kind: "added" },
    ],
    {
      [`b:${FLIP}`]: OPEN,
      [`h:${FLIP}`]: DELIVERED,
      "b:.handsealed.yml": CONFIG,
      "h:test/a.test.ts": MARKED_TEST,
    },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  assert.deepEqual(
    verdicts.rules.map((r) => r.rule),
    ["lane", "binding", "ceiling", "evidence", "acceptance"],
  );
});

test("adversarial: unclaimed acceptance bullets fail an additive mandate", async () => {
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "test/a.test.ts", kind: "added" },
    ],
    {
      [`b:${FLIP}`]: OPEN,
      [`h:${FLIP}`]: DELIVERED,
      "b:.handsealed.yml": CONFIG,
      "h:test/a.test.ts": 'test("no markers here", () => {});\n',
    },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "fail");
  const acceptance = verdicts.rules.find((r) => r.rule === "acceptance");
  assert.match(acceptance?.findings[0]?.message ?? "", /unclaimed/);
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

test("an invalid base config fails closed", async () => {
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "src/a.ts", kind: "modified" },
    ],
    {
      [`b:${FLIP}`]: OPEN,
      [`h:${FLIP}`]: DELIVERED,
      "b:.handsealed.yml": "version: 2\n",
    },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "fail");
  const config = verdicts.rules.find((r) => r.rule === "config");
  assert.equal(config?.status, "fail");
  assert.match(config?.findings[0]?.message ?? "", /base config invalid/);
});

test("[01ky2z5m3a9dfe-harden-the-judge-against-reopen-and-config-edits#2] adversarial: a change cannot loosen its own rulebook — the config is judged at base", async () => {
  const permissive = CONFIG.replace("  - test", "  - outside");
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "outside/b.ts", kind: "added" },
      { path: ".handsealed.yml", kind: "modified" },
    ],
    {
      [`b:${FLIP}`]: OPEN,
      [`h:${FLIP}`]: DELIVERED,
      "b:.handsealed.yml": CONFIG,
      "h:.handsealed.yml": permissive,
    },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "fail");
  const config = verdicts.rules.find((r) => r.rule === "config");
  assert.equal(config?.status, "attention");
  assert.match(config?.findings[0]?.message ?? "", /judged with the base config/);
  const ceiling = verdicts.rules.find((r) => r.rule === "ceiling");
  assert.equal(ceiling?.status, "fail");
  assert.equal(
    ceiling?.findings.some((f) => f.path === "outside/b.ts"),
    true,
  );
});

test("config introduced in the diff takes effect only after merge", async () => {
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "src/a.ts", kind: "modified" },
      { path: ".handsealed.yml", kind: "added" },
    ],
    { [`b:${FLIP}`]: OPEN, [`h:${FLIP}`]: DELIVERED, "h:.handsealed.yml": CONFIG },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  const config = verdicts.rules.find((r) => r.rule === "config");
  assert.equal(config?.status, "info");
  assert.equal(
    config?.findings.some((f) => f.message.includes("takes effect after merge")),
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
  const facts = factsFor([{ path: FLIP, kind: "modified" }], {
    [`b:${FLIP}`]: OPEN,
    [`h:${FLIP}`]: amended,
  });
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  assert.deepEqual(
    verdicts.rules.map((r) => r.rule),
    ["lane", "spec-lane"],
  );
});

test("[01ky2z5m3a9dfe-harden-the-judge-against-reopen-and-config-edits#1] adversarial: a delivered mandate cannot be reopened through the spec lane", async () => {
  const facts = factsFor([{ path: FLIP, kind: "modified" }], {
    [`b:${FLIP}`]: DELIVERED,
    [`h:${FLIP}`]: OPEN,
  });
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "fail");
  const specLane = verdicts.rules.find((r) => r.rule === "spec-lane");
  assert.match(specLane?.findings[0]?.message ?? "", /immutable history/);
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
    "b:.handsealed.yml": CONFIG,
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
