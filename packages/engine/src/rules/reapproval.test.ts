import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { PatchIdentity } from "@handsealed/facts";
import { reapprovalFact } from "./reapproval.js";

const identity = (combined: string, files: Array<[string, string]>): PatchIdentity => ({
  combined,
  files: files.map(([path, id]) => ({ path, id })),
});

test("no approved snapshot is a stated fact", () => {
  const result = reapprovalFact(null, identity("a", [["x.ts", "1"]]));
  assert.equal(result.status, "info");
});

test("patch-identical content reads as only-the-base-moved", () => {
  const snapshot = identity("abc", [["x.ts", "1"]]);
  const result = reapprovalFact(snapshot, identity("abc", [["x.ts", "1"]]));
  assert.equal(result.status, "pass");
  assert.match(result.findings[0]?.message ?? "", /only the base moved/);
});

test("adversarial: any difference reads as changed, with the per-file delta", () => {
  const approved = identity("abc", [
    ["a.ts", "1"],
    ["b.ts", "2"],
  ]);
  const current = identity("def", [
    ["a.ts", "1x"],
    ["c.ts", "3"],
  ]);
  const result = reapprovalFact(approved, current);
  assert.equal(result.status, "attention");
  const messages = result.findings.map((f) => `${f.message}:${f.path}`);
  assert.deepEqual(messages.sort(), [
    "changed since approval:a.ts",
    "new since approval:c.ts",
    "no longer changed since approval:b.ts",
  ]);
});

test("conservative: combined mismatch alone still reads as changed", () => {
  const result = reapprovalFact(identity("abc", [["a.ts", "1"]]), identity("zzz", [["a.ts", "1"]]));
  assert.equal(result.status, "attention");
  assert.match(result.findings[0]?.message ?? "", /shifted since approval/);
});
