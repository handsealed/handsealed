import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mapAcceptance } from "./acceptance.js";

const SLUG = "01k0h3v8-do-thing";

test("full coverage passes with claim counts", () => {
  const result = mapAcceptance(SLUG, 2, [
    `[${SLUG}#1] shows the delta`,
    `[${SLUG}#2] renders +0 for zero`,
    `[${SLUG}#1] shows the delta for guests`,
  ]);
  assert.equal(result.status, "pass");
  assert.match(result.findings[0]?.message ?? "", /all 2 bullet\(s\) claimed \(3 claim\(s\)/);
});

test("adversarial: an unclaimed bullet fails, by number", () => {
  const result = mapAcceptance(SLUG, 2, [`[${SLUG}#1] shows the delta`]);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /bullet #2 is unclaimed/);
});

test("adversarial: claiming a nonexistent bullet fails", () => {
  const result = mapAcceptance(SLUG, 2, [
    `[${SLUG}#1] a`,
    `[${SLUG}#2] b`,
    `[${SLUG}#7] fantasy coverage`,
  ]);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /nonexistent bullet #7/);
});

test("markers for other specs are ignored", () => {
  const result = mapAcceptance(SLUG, 1, ["[01k0h3v9-other#1] different mandate"]);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /bullet #1 is unclaimed/);
});

test("one test may claim several bullets", () => {
  const result = mapAcceptance(SLUG, 2, [`[${SLUG}#1][${SLUG}#2] end to end`]);
  assert.equal(result.status, "pass");
});
