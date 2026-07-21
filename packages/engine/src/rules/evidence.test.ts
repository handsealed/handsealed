import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { PathChange } from "../facts.js";
import type { EvidenceClass, Spec } from "../formats/spec.js";
import { checkEvidenceConsistency } from "./evidence.js";

const FLIP = "specs/01k0h3v8-a.md";
const ROOTS = ["test", "packages/*/src"];
const spec = (evidence: EvidenceClass): Spec => ({
  status: "delivered",
  evidence,
  outcome: "x",
  acceptance: ["y"],
});
const changes = (...paths: string[]): PathChange[] => [
  { path: FLIP, kind: "modified" },
  ...paths.map((path): PathChange => ({ path, kind: "modified" })),
];

test("additive with changed tests passes", () => {
  const result = checkEvidenceConsistency(
    spec("additive"),
    changes("src/a.ts", "test/a.test.ts"),
    FLIP,
    ROOTS,
  );
  assert.equal(result.status, "pass");
  assert.match(result.findings[0]?.message ?? "", /assay applies/);
});

test("adversarial: additive without tests fails", () => {
  const result = checkEvidenceConsistency(spec("additive"), changes("src/a.ts"), FLIP, ROOTS);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /no new or changed tests/);
});

test("exempt allows the flip alone", () => {
  const result = checkEvidenceConsistency(spec("exempt"), changes(), FLIP, ROOTS);
  assert.equal(result.status, "pass");
});

test("adversarial: any change under an exempt mandate fails, by name", () => {
  const result = checkEvidenceConsistency(spec("exempt"), changes("src/a.ts"), FLIP, ROOTS);
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0]?.path, "src/a.ts");
});

test("non-additive with product changes names the cardinality guard", () => {
  const result = checkEvidenceConsistency(spec("non-additive"), changes("src/a.ts"), FLIP, ROOTS);
  assert.equal(result.status, "pass");
  assert.match(result.findings[0]?.message ?? "", /cardinality guard applies/);
});

test("non-additive with test changes reads as extra coverage", () => {
  const result = checkEvidenceConsistency(
    spec("non-additive"),
    changes("test/extra.test.ts"),
    FLIP,
    ROOTS,
  );
  assert.equal(result.status, "pass");
  assert.match(result.findings[0]?.message ?? "", /extra coverage/);
});
