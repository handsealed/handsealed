import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isConventional, violations } from "./check-conventional.mjs";

test("accepts standard conventional subjects", () => {
  for (const s of [
    "feat: add mandate parser",
    "fix(engine): patch-id stability on renames",
    "chore: scaffold monorepo",
    "refactor(facts-git)!: change Facts interface",
    "docs: add security policy",
  ]) {
    assert.equal(isConventional(s), true, s);
  }
});

test("rejects non-conventional subjects", () => {
  for (const s of [
    "Add mandate parser",
    "feat:missing space",
    "feature: unknown type",
    "fix(EngIne): uppercase scope",
    "fix: ",
    "wip",
  ]) {
    assert.equal(isConventional(s), false, s);
  }
});

test("violations skips merge commits", () => {
  const bad = violations(["Merge branch 'x' into main", "feat: ok", "not conventional"]);
  assert.deepEqual(bad, ["not conventional"]);
});
