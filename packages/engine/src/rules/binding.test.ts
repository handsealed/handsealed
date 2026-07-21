import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Facts, PathChange } from "../facts.js";
import { validateBinding } from "./binding.js";

const never = async (): Promise<never> => {
  throw new Error("unused in this test");
};
const stub: Facts = {
  pathsChanged: never,
  fileAtRef: never,
  patchOf: never,
  isAncestor: never,
  mergeBase: never,
  patchIdOf: never,
  rangeDiff: never,
  mergeTreePreflight: never,
};

const factsWith = (files: Record<string, string>): Facts => ({
  ...stub,
  fileAtRef: async (rev, path) => files[`${rev}:${path}`] ?? null,
});

const FLIP = "specs/01k0h3v8-do-thing.md";
const OPEN = `status: open\nevidence: additive\noutcome: Do the thing.\nacceptance:\n- It works.\n`;
const DELIVERED = OPEN.replace("status: open", "status: delivered");
const modified = (path: string): PathChange => ({ path, kind: "modified" });

test("a clean flip binds the mandate", async () => {
  const facts = factsWith({ [`b:${FLIP}`]: OPEN, [`h:${FLIP}`]: DELIVERED });
  const result = await validateBinding(facts, "b", "h", [modified(FLIP), modified("src/a.ts")]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.verdict.status, "pass");
  assert.equal(result.spec.status, "delivered");
  assert.equal(result.slug, "01k0h3v8-do-thing");
  assert.equal(result.flipPath, FLIP);
});

test("adversarial: no spec flipped means no mandate", async () => {
  const result = await validateBinding(stub, "b", "h", [modified("src/a.ts")]);
  assert.equal(result.verdict.status, "fail");
  assert.match(result.verdict.findings[0]?.message ?? "", /no mandate/);
});

test("adversarial: a second flip fails", async () => {
  const result = await validateBinding(stub, "b", "h", [
    modified(FLIP),
    modified("specs/01k0h3v9-other.md"),
  ]);
  assert.equal(result.verdict.status, "fail");
  assert.match(result.verdict.findings[0]?.message ?? "", /more than one spec/);
});

test("adversarial: a spec smuggled into the same change is self-authorization", async () => {
  const result = await validateBinding(stub, "b", "h", [{ path: FLIP, kind: "added" }]);
  assert.equal(result.verdict.status, "fail");
  assert.match(result.verdict.findings[0]?.message ?? "", /self-authorization/);
});

test("adversarial: deleting a spec is never a flip", async () => {
  const result = await validateBinding(stub, "b", "h", [{ path: FLIP, kind: "deleted" }]);
  assert.equal(result.verdict.status, "fail");
});

test("adversarial: a delivered mandate never authorizes twice", async () => {
  const facts = factsWith({ [`b:${FLIP}`]: DELIVERED, [`h:${FLIP}`]: DELIVERED });
  const result = await validateBinding(facts, "b", "h", [modified(FLIP)]);
  assert.equal(result.verdict.status, "fail");
  assert.match(result.verdict.findings[0]?.message ?? "", /never authorizes twice/);
});

test("adversarial: the flip may change nothing but the status line", async () => {
  const dirty = DELIVERED.replace("Do the thing.", "Do a different thing.");
  const facts = factsWith({ [`b:${FLIP}`]: OPEN, [`h:${FLIP}`]: dirty });
  const result = await validateBinding(facts, "b", "h", [modified(FLIP)]);
  assert.equal(result.verdict.status, "fail");
  assert.match(result.verdict.findings[0]?.message ?? "", /nothing but the status line/);
});

test("adversarial: a spec absent at base authorizes nothing", async () => {
  const facts = factsWith({ [`h:${FLIP}`]: DELIVERED });
  const result = await validateBinding(facts, "b", "h", [modified(FLIP)]);
  assert.equal(result.verdict.status, "fail");
  assert.match(result.verdict.findings[0]?.message ?? "", /does not exist at base/);
});

test("invalid spec filenames fail", async () => {
  const path = "specs/42-feature.md";
  const result = await validateBinding(stub, "b", "h", [modified(path)]);
  assert.equal(result.verdict.status, "fail");
  assert.match(result.verdict.findings[0]?.message ?? "", /invalid spec filename/);
});

test("an unparseable base spec fails with its issues", async () => {
  const facts = factsWith({ [`b:${FLIP}`]: "garbage\n", [`h:${FLIP}`]: DELIVERED });
  const result = await validateBinding(facts, "b", "h", [modified(FLIP)]);
  assert.equal(result.verdict.status, "fail");
  assert.match(result.verdict.findings[0]?.message ?? "", /base spec invalid/);
});
