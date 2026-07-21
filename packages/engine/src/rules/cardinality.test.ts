import { strict as assert } from "node:assert";
import { test } from "node:test";
import { compareCardinality } from "./cardinality.js";

test("no baseline degrades to a stated fact, never a silent pass", () => {
  const result = compareCardinality(undefined, { scripts: 10 });
  assert.equal(result.status, "info");
  assert.match(result.findings[0]?.message ?? "", /no baseline — counts unverified/);
});

test("stable counts pass", () => {
  const result = compareCardinality({ scripts: 10, backend: 400 }, { scripts: 10, backend: 402 });
  assert.equal(result.status, "pass");
  assert.match(result.findings[0]?.message ?? "", /no suite shrank/);
});

test("adversarial: a count drop is flagged with the numbers", () => {
  const result = compareCardinality({ backend: 412 }, { backend: 268 });
  assert.equal(result.status, "attention");
  assert.match(result.findings[0]?.message ?? "", /"backend" shrank: 412 → 268/);
});

test("adversarial: a disappeared suite is flagged", () => {
  const result = compareCardinality({ backend: 412, scripts: 9 }, { scripts: 9 });
  assert.equal(result.status, "attention");
  assert.match(result.findings[0]?.message ?? "", /"backend" disappeared/);
});

test("a new suite is a stated fact", () => {
  const result = compareCardinality({ scripts: 9 }, { scripts: 9, frontend: 120 });
  assert.equal(result.status, "pass");
  assert.match(result.findings[0]?.message ?? "", /new suite "frontend" \(120 test\(s\)\)/);
});
