import { strict as assert } from "node:assert";
import { test } from "node:test";
import { memoryFacts } from "@handsealed/facts/memory";
import type { PathChange } from "@handsealed/facts";
import { validateBinding } from "./binding.js";

const stub = memoryFacts();
const factsWith = (files: Record<string, string>) => memoryFacts({ files });

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

test("adversarial: a spec created still open in the same change authorizes nothing", async () => {
  const facts = factsWith({ [`h:${FLIP}`]: OPEN });
  const result = await validateBinding(facts, "b", "h", [{ path: FLIP, kind: "added" }]);
  assert.equal(result.verdict.status, "fail");
  assert.match(result.verdict.findings[0]?.message ?? "", /authorizes nothing/);
});

test("a mandate created delivered binds as a one-shot", async () => {
  const facts = factsWith({ [`h:${FLIP}`]: DELIVERED });
  const result = await validateBinding(facts, "b", "h", [
    { path: FLIP, kind: "added" },
    modified("src/a.ts"),
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.mode, "oneshot");
  assert.equal(result.slug, "01k0h3v8-do-thing");
  assert.match(result.verdict.findings[0]?.message ?? "", /one-shot, signature required/);
});

test("a clean flip binds with mode flip and may carry its own signature", async () => {
  const facts = factsWith({ [`b:${FLIP}`]: OPEN, [`h:${FLIP}`]: DELIVERED });
  const result = await validateBinding(facts, "b", "h", [
    modified(FLIP),
    { path: "specs/01k0h3v8-do-thing.sig", kind: "added" },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.mode, "flip");
});

test("adversarial: a foreign signature riding the change is refused", async () => {
  const facts = factsWith({ [`b:${FLIP}`]: OPEN, [`h:${FLIP}`]: DELIVERED });
  const result = await validateBinding(facts, "b", "h", [
    modified(FLIP),
    { path: "specs/01k0h3v9-other.sig", kind: "added" },
  ]);
  assert.equal(result.verdict.status, "fail");
  assert.match(result.verdict.findings[0]?.message ?? "", /own signature/);
});

test("adversarial: a stray file under specs/ is refused", async () => {
  const result = await validateBinding(stub, "b", "h", [
    modified(FLIP),
    { path: "specs/notes.txt", kind: "added" },
  ]);
  assert.equal(result.verdict.status, "fail");
  assert.match(result.verdict.findings[0]?.message ?? "", /unexpected file/);
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

test("the bound mandate's own red receipt is a companion, never a stray", async () => {
  const facts = memoryFacts({
    files: { [`b:${FLIP}`]: OPEN, [`h:${FLIP}`]: DELIVERED },
  });
  const result = await validateBinding(facts, "b", "h", [
    { path: FLIP, kind: "modified" },
    { path: FLIP.replace(/\.md$/, ".red.json"), kind: "added" },
  ]);
  assert.equal(result.ok, true);
});

test("adversarial: a foreign red receipt riding the change is refused", async () => {
  const facts = memoryFacts({
    files: { [`b:${FLIP}`]: OPEN, [`h:${FLIP}`]: DELIVERED },
  });
  const result = await validateBinding(facts, "b", "h", [
    { path: FLIP, kind: "modified" },
    { path: "specs/01zabcdefgh234-another-mandate.red.json", kind: "added" },
  ]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.verdict.findings[0]?.message ?? "", /own red receipt/);
  }
});
