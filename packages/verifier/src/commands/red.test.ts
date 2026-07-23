import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { SuiteResults } from "@handsealed/engine";
import { parseRedReceipt } from "@handsealed/engine";
import { buildRedReceipt, renderRedReceipt } from "./red.js";

const SLUG = "01ky7p4fqhjjq9-red-attestation-and-signature-envelope-v2";
const SHA = "c".repeat(40);

const results = (cases: SuiteResults["cases"]): SuiteResults => ({
  version: 1,
  suite: "engine",
  cases,
});

test(`[01ky7p4fqhjjq9-red-attestation-and-signature-envelope-v2#4] the helper writes a receipt carrying only the marked failing cases`, () => {
  const built = buildRedReceipt(SLUG, SHA, [
    results([
      { name: `[${SLUG}#1] rejects the stale token`, outcome: "fail" },
      { name: "an unrelated case that passed", outcome: "pass" },
      { name: `[${SLUG}#2] accepts the fresh token`, outcome: "fail" },
    ]),
  ]);
  assert.ok(built.ok, built.ok ? "" : built.error);
  assert.equal(built.receipt.cases.length, 2);
  assert.ok(built.receipt.cases.every((c) => c.outcome === "fail"));
  assert.ok(built.receipt.cases.every((c) => c.name.includes(`[${SLUG}#`)));
  const parsed = parseRedReceipt(renderRedReceipt(built.receipt));
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.issue);
});

test(`[01ky7p4fqhjjq9-red-attestation-and-signature-envelope-v2#4] a marked case that passed at the checkpoint refuses the receipt`, () => {
  const built = buildRedReceipt(SLUG, SHA, [
    results([
      { name: `[${SLUG}#1] rejects the stale token`, outcome: "fail" },
      { name: `[${SLUG}#2] already passes — vacuous`, outcome: "pass" },
    ]),
  ]);
  assert.ok(!built.ok);
  if (!built.ok) assert.match(built.error, /did not fail at the checkpoint/);
});

test("no marked case at all, and a short sha, both refuse", () => {
  const none = buildRedReceipt(SLUG, SHA, [results([{ name: "unmarked", outcome: "fail" }])]);
  assert.ok(!none.ok);
  if (!none.ok) assert.match(none.error, /no case carries/);
  const short = buildRedReceipt(SLUG, "c1a0", [
    results([{ name: `[${SLUG}#1] x`, outcome: "fail" }]),
  ]);
  assert.ok(!short.ok);
  if (!short.ok) assert.match(short.error, /full lowercase/);
});

test("duplicate case names across suites dedupe in the receipt", () => {
  const built = buildRedReceipt(SLUG, SHA, [
    results([{ name: `[${SLUG}#1] x`, outcome: "fail" }]),
    results([{ name: `[${SLUG}#1] x`, outcome: "fail" }]),
  ]);
  assert.ok(built.ok);
  if (built.ok) assert.equal(built.receipt.cases.length, 1);
});
