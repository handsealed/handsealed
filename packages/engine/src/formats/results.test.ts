import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mapAcceptance } from "../rules/acceptance.js";
import { compareCardinality } from "../rules/cardinality.js";
import { cardinalityOf, caseNames, countsOf, parseResults } from "./results.js";

const VALID = JSON.stringify({
  version: 1,
  suite: "scripts",
  cases: [
    { name: "[01k0h3v8-do-thing#1] shows the delta", outcome: "pass" },
    { name: "[01k0h3v8-do-thing#2] renders +0", outcome: "pass" },
    { name: "an unrelated case", outcome: "skip" },
  ],
});

test("parses a valid results file and derives counts", () => {
  const result = parseResults(VALID);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.suite, "scripts");
  assert.deepEqual(countsOf(result.value), { total: 3, pass: 2, fail: 0, skip: 1 });
});

const INVALID: Array<{ name: string; source: string; expect: string }> = [
  { name: "broken JSON", source: "{nope", expect: "invalid JSON" },
  { name: "not an object", source: "[1,2]", expect: "must be a JSON object" },
  {
    name: "wrong version",
    source: VALID.replace('"version":1', '"version":2'),
    expect: '"version" must be 1',
  },
  {
    name: "bad suite name",
    source: VALID.replace('"suite":"scripts"', '"suite":"Scripts!"'),
    expect: '"suite" must match',
  },
  {
    name: "cases not array",
    source: VALID.replace(/"cases":\[.*\]/, '"cases":"lots"'),
    expect: '"cases" must be an array',
  },
  {
    name: "case missing name",
    source: VALID.replace('"name":"an unrelated case",', ""),
    expect: "cases[2].name",
  },
  {
    name: "bad outcome",
    source: VALID.replace('"outcome":"skip"', '"outcome":"maybe"'),
    expect: "cases[2].outcome must be pass | fail | skip",
  },
  {
    name: "unknown top key",
    source: VALID.replace('"version":1', '"version":1,"extra":true'),
    expect: 'unknown key "extra"',
  },
  {
    name: "unknown case key",
    source: VALID.replace('"outcome":"skip"', '"outcome":"skip","ms":4'),
    expect: 'cases[2] has unknown key "ms"',
  },
];

for (const fixture of INVALID) {
  test(`rejects: ${fixture.name}`, () => {
    const result = parseResults(fixture.source);
    assert.equal(result.ok, false, "expected failure");
    if (result.ok) return;
    const hit = result.issues.find((i) => i.message.includes(fixture.expect));
    assert.notEqual(
      hit,
      undefined,
      `no issue matching "${fixture.expect}" in: ${result.issues.map((i) => i.message).join(" | ")}`,
    );
  });
}

test("wiring: cardinalityOf feeds the cardinality guard", () => {
  const base = parseResults(VALID);
  const shrunk = parseResults(
    VALID.replace(/,\{"name":"an unrelated case","outcome":"skip"\}/, ""),
  );
  assert.equal(base.ok && shrunk.ok, true);
  if (!base.ok || !shrunk.ok) return;
  const verdict = compareCardinality(cardinalityOf([base.value]), cardinalityOf([shrunk.value]));
  assert.equal(verdict.status, "attention");
  assert.match(verdict.findings[0]?.message ?? "", /"scripts" shrank: 3 → 2/);
});

test("wiring: caseNames feed the acceptance map", () => {
  const parsed = parseResults(VALID);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const verdict = mapAcceptance("01k0h3v8-do-thing", 2, caseNames(parsed.value));
  assert.equal(verdict.status, "pass");
});

test("duplicate suites in a result set throw (fail-closed)", () => {
  const parsed = parseResults(VALID);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.throws(() => cardinalityOf([parsed.value, parsed.value]), /duplicate suite "scripts"/);
});
