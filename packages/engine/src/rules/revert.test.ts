import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Facts, PatchIdentity } from "../facts.js";
import { checkRevert } from "./revert.js";

const never = async (): Promise<never> => {
  throw new Error("unused in this test");
};

const factsWithIds = (ids: Record<string, PatchIdentity>): Facts => ({
  pathsChanged: never,
  fileAtRef: never,
  patchOf: never,
  isAncestor: never,
  mergeBase: never,
  rangeDiff: never,
  mergeTreePreflight: never,
  patchIdOf: async (base, head) => {
    const found = ids[`${base}:${head}`];
    if (found === undefined) throw new Error(`no id for ${base}:${head}`);
    return found;
  },
});

test("a pure inversion passes", async () => {
  const facts = factsWithIds({
    "rb:rh": { combined: "same", files: [{ path: "a.ts", id: "x" }] },
    "oh:op": { combined: "same", files: [{ path: "a.ts", id: "x" }] },
  });
  const result = await checkRevert(facts, { base: "rb", head: "rh" }, { parent: "op", head: "oh" });
  assert.equal(result.status, "pass");
  assert.match(result.findings[0]?.message ?? "", /patch-identical to the inverse/);
});

test("adversarial: an impure revert fails with the mismatched paths", async () => {
  const facts = factsWithIds({
    "rb:rh": {
      combined: "one",
      files: [
        { path: "a.ts", id: "x" },
        { path: "sneaky.ts", id: "s" },
      ],
    },
    "oh:op": {
      combined: "two",
      files: [
        { path: "a.ts", id: "x" },
        { path: "b.ts", id: "y" },
      ],
    },
  });
  const result = await checkRevert(facts, { base: "rb", head: "rh" }, { parent: "op", head: "oh" });
  assert.equal(result.status, "fail");
  const paths = result.findings.map((f) => f.path).sort();
  assert.deepEqual(paths, ["b.ts", "sneaky.ts"]);
});
