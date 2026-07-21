import { strict as assert } from "node:assert";
import { test } from "node:test";
import { memoryFacts } from "./memory.js";

test("files read by revision:path, absent keys are null", async () => {
  const facts = memoryFacts({ files: { "h:a.ts": "content\n" } });
  assert.equal(await facts.fileAtRef("h", "a.ts"), "content\n");
  assert.equal(await facts.fileAtRef("h", "missing.ts"), null);
});

test("changes as an array answer every range", async () => {
  const changes = [{ path: "a.ts", kind: "modified" } as const];
  const facts = memoryFacts({ changes });
  assert.deepEqual(await facts.pathsChanged("b", "h"), changes);
  assert.deepEqual(await facts.pathsChanged("x", "y"), changes);
});

test("changes as a range map are looked up by base..head", async () => {
  const facts = memoryFacts({ changes: { "b..h": [{ path: "a.ts", kind: "added" }] } });
  assert.equal((await facts.pathsChanged("b", "h"))[0]?.kind, "added");
  await assert.rejects(() => facts.pathsChanged("b", "other"), /pathsChanged\(b\.\.other\)/);
});

test("patch identities and graph predicates come from config", async () => {
  const facts = memoryFacts({
    patchIds: { "b..h": { combined: "id", files: [] } },
    isAncestor: (a, b) => a === "root" && b === "head",
    mergeBase: () => null,
  });
  assert.equal((await facts.patchIdOf("b", "h")).combined, "id");
  assert.equal(await facts.isAncestor("root", "head"), true);
  assert.equal(await facts.isAncestor("head", "root"), false);
  assert.equal(await facts.mergeBase("a", "b"), null);
});

test("unconfigured methods throw, naming themselves", async () => {
  const facts = memoryFacts();
  await assert.rejects(() => facts.pathsChanged("b", "h"), /pathsChanged/);
  await assert.rejects(() => facts.patchIdOf("b", "h"), /patchIdOf/);
  await assert.rejects(() => facts.isAncestor("a", "b"), /isAncestor/);
  await assert.rejects(() => facts.mergeBase("a", "b"), /mergeBase/);
});
