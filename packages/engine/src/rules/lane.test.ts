import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { PathChange } from "@handsealed/facts";
import { classifyLane } from "./lane.js";

const change = (
  path: string,
  kind: PathChange["kind"] = "modified",
  fromPath?: string,
): PathChange => (fromPath === undefined ? { path, kind } : { path, kind, fromPath });

test("spec-only diffs classify as the spec lane", () => {
  const result = classifyLane([change("specs/01k0h3v8-a.md", "added")]);
  assert.equal(result.lane, "mandate");
  assert.equal(result.verdict.status, "pass");
});

test("workflow-only diffs classify as the maintenance lane", () => {
  const result = classifyLane([change(".github/workflows/ci.yml")]);
  assert.equal(result.lane, "maintenance");
  assert.equal(result.verdict.status, "pass");
});

test("product diffs classify as the implementation lane", () => {
  const result = classifyLane([change("src/a.ts"), change("specs/01k0h3v8-a.md")]);
  assert.equal(result.lane, "implementation");
  assert.equal(result.verdict.status, "pass");
});

test("adversarial: the thin fence fails implementation diffs touching workflows", () => {
  const result = classifyLane([change("src/a.ts"), change(".github/workflows/ci.yml")]);
  assert.equal(result.lane, "implementation");
  assert.equal(result.verdict.status, "fail");
  assert.equal(result.verdict.findings[0]?.path, ".github/workflows/ci.yml");
});

test("adversarial: a rename out of specs/ is not the spec lane", () => {
  const result = classifyLane([change("docs/x.md", "renamed", "specs/01k0h3v8-a.md")]);
  assert.equal(result.lane, "implementation");
});

test("an empty change set fails", () => {
  const result = classifyLane([]);
  assert.equal(result.verdict.status, "fail");
});
