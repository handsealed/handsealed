import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Facts, PathChange } from "../facts.js";
import { validateSpecLane } from "./spec-lane.js";

const never = async (): Promise<never> => {
  throw new Error("unused in this test");
};
const factsWith = (files: Record<string, string>): Facts => ({
  pathsChanged: never,
  patchOf: never,
  isAncestor: never,
  mergeBase: never,
  patchIdOf: never,
  rangeDiff: never,
  mergeTreePreflight: never,
  fileAtRef: async (rev, path) => files[`${rev}:${path}`] ?? null,
});

const OPEN = `status: open\nevidence: additive\noutcome: Do the thing.\nacceptance:\n- It works.\n`;
const PATH = "specs/01k0h3v8-do-thing.md";
const added = (path: string, kind: PathChange["kind"] = "added"): PathChange => ({ path, kind });

test("valid open specs pass", async () => {
  const facts = factsWith({ [`h:${PATH}`]: OPEN });
  const result = await validateSpecLane(facts, "h", [added(PATH)]);
  assert.equal(result.status, "pass");
});

test("adversarial: a spec-lane change may not deliver its own mandate", async () => {
  const facts = factsWith({ [`h:${PATH}`]: OPEN.replace("status: open", "status: delivered") });
  const result = await validateSpecLane(facts, "h", [added(PATH)]);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /flips happen in implementation changes/);
});

test("deletes, renames, bad filenames, and unparseable specs fail by name", async () => {
  const facts = factsWith({ [`h:specs/42-bad.md`]: OPEN, [`h:${PATH}`]: "garbage\n" });
  const result = await validateSpecLane(facts, "h", [
    added("specs/01k0h3v9-old.md", "deleted"),
    added("specs/42-bad.md"),
    added(PATH, "modified"),
  ]);
  assert.equal(result.status, "fail");
  const messages = result.findings.map((f) => f.message);
  assert.equal(
    messages.some((m) => m.includes("never deleted")),
    true,
  );
  assert.equal(
    messages.some((m) => m.includes("invalid spec filename")),
    true,
  );
  assert.equal(
    messages.some((m) => m.includes("invalid spec:")),
    true,
  );
});
