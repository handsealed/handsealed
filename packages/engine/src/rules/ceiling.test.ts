import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { PathChange } from "../facts.js";
import type { Spec } from "../formats/spec.js";
import { checkCeiling } from "./ceiling.js";
import { globToRegExp, matchesPattern } from "./glob.js";

const FLIP = "specs/01k0h3v8-a.md";
const spec = (paths?: string[]): Spec => {
  const base: Spec = {
    status: "delivered",
    evidence: "additive",
    outcome: "x",
    acceptance: ["y"],
  };
  return paths === undefined ? base : { ...base, paths };
};
const changed = (...paths: string[]): PathChange[] => [
  { path: FLIP, kind: "modified" },
  ...paths.map((path): PathChange => ({ path, kind: "modified" })),
];

test("glob semantics", () => {
  assert.equal(globToRegExp("**/x").test("x"), true);
  assert.equal(globToRegExp("**/x").test("a/b/x"), true);
  assert.equal(globToRegExp("a/*").test("a/b"), true);
  assert.equal(globToRegExp("a/*").test("a/b/c"), false);
  assert.equal(globToRegExp("a/**").test("a/b/c"), true);
  assert.equal(matchesPattern("apps/frontend/lib/x.dart", "apps/frontend"), true);
  assert.equal(matchesPattern("apps/frontend2/x", "apps/frontend"), false);
});

test("no declared ceiling is a stated fact, not a pass claim", () => {
  const result = checkCeiling(spec(), changed("anywhere/at/all.ts"), FLIP, []);
  assert.equal(result.status, "info");
  assert.match(result.findings[0]?.message ?? "", /no ceiling declared/);
});

test("changes inside the ceiling pass", () => {
  const result = checkCeiling(
    spec(["apps/frontend/**"]),
    changed("apps/frontend/lib/a.dart"),
    FLIP,
    [],
  );
  assert.equal(result.status, "pass");
});

test("adversarial: a breach is out of mandate, by name", () => {
  const result = checkCeiling(
    spec(["apps/frontend/**"]),
    changed("apps/frontend/lib/a.dart", "apps/backend/lib/payout.ex"),
    FLIP,
    [],
  );
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0]?.message, "out of mandate");
  assert.equal(result.findings[0]?.path, "apps/backend/lib/payout.ex");
});

test("test roots are always allowed", () => {
  const result = checkCeiling(spec(["apps/frontend/**"]), changed("test/a_test.ts"), FLIP, [
    "test",
  ]);
  assert.equal(result.status, "pass");
});

test("adversarial: a rename dragging content from outside the ceiling breaches", () => {
  const changes: PathChange[] = [
    { path: FLIP, kind: "modified" },
    { path: "apps/frontend/lib/moved.dart", kind: "renamed", fromPath: "apps/backend/lib/x.ex" },
  ];
  const result = checkCeiling(spec(["apps/frontend/**"]), changes, FLIP, []);
  assert.equal(result.status, "fail");
});
