import { strict as assert } from "node:assert";
import { test } from "node:test";
import { memoryFacts } from "@handsealed/facts/memory";
import type { PatchIdentity } from "../facts.js";
import { checkRevert } from "./revert.js";

const factsWithIds = (patchIds: Record<string, PatchIdentity>) => memoryFacts({ patchIds });

test("a pure inversion passes", async () => {
  const facts = factsWithIds({
    "rb..rh": { combined: "same", files: [{ path: "a.ts", id: "x" }] },
    "oh..op": { combined: "same", files: [{ path: "a.ts", id: "x" }] },
  });
  const result = await checkRevert(facts, { base: "rb", head: "rh" }, { parent: "op", head: "oh" });
  assert.equal(result.status, "pass");
  assert.match(result.findings[0]?.message ?? "", /patch-identical to the inverse/);
});

test("adversarial: an impure revert fails with the mismatched paths", async () => {
  const facts = factsWithIds({
    "rb..rh": {
      combined: "one",
      files: [
        { path: "a.ts", id: "x" },
        { path: "sneaky.ts", id: "s" },
      ],
    },
    "oh..op": {
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
