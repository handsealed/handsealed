import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseRedReceipt } from "./red.js";

const SHA = "8670b1f9".padEnd(40, "0");

const receipt = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    version: 1,
    sha: SHA,
    cases: [
      { name: "[01abcdefgh2345-fixture-mandate#1] rejects the stale token", outcome: "fail" },
    ],
    ...overrides,
  });

test("a well-formed receipt parses", () => {
  const parsed = parseRedReceipt(receipt());
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.issue);
  assert.equal(parsed.receipt.sha, SHA);
  assert.equal(parsed.receipt.cases.length, 1);
});

test("non-JSON, non-object, and wrong-version receipts are refused", () => {
  assert.ok(!parseRedReceipt("not json").ok);
  assert.ok(!parseRedReceipt('"a string"').ok);
  const version = parseRedReceipt(receipt({ version: 2 }));
  assert.ok(!version.ok);
  assert.match(version.issue, /version/);
});

test("the sha must be a full lowercase commit hash", () => {
  const short = parseRedReceipt(receipt({ sha: "8670b1f9" }));
  assert.ok(!short.ok);
  assert.match(short.issue, /full lowercase/);
  const sha256 = parseRedReceipt(receipt({ sha: "a".repeat(64) }));
  assert.ok(sha256.ok);
});

test("cases must be non-empty, named, and all failing", () => {
  const empty = parseRedReceipt(receipt({ cases: [] }));
  assert.ok(!empty.ok);
  const nameless = parseRedReceipt(receipt({ cases: [{ name: " ", outcome: "fail" }] }));
  assert.ok(!nameless.ok);
  const passing = parseRedReceipt(receipt({ cases: [{ name: "x", outcome: "pass" }] }));
  assert.ok(!passing.ok);
  assert.match(passing.issue, /only failing cases/);
});
