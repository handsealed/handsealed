import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseSpec } from "../formats/spec.js";
import { checkExecution } from "./execution.js";

const SLUG = "01k0h3v8-do-thing";
const spec = (evidence: string, bullets = 1) => {
  const acceptance = Array.from({ length: bullets }, (_, i) => `- Bullet ${i + 1}.`).join("\n");
  const parsed = parseSpec(
    `status: delivered\nevidence: ${evidence}\noutcome: X.\nacceptance:\n${acceptance}\n`,
  );
  if (!parsed.ok) throw new Error("fixture spec must parse");
  return parsed.value;
};
const suite = (name: string, cases: { name: string; outcome: "pass" | "fail" | "skip" }[]) => ({
  version: 1 as const,
  suite: name,
  cases,
});

test("[01ky67bhen2xbe-evidence-execution-attestation#1] a failing case fails the execution rule by name", () => {
  const result = checkExecution(spec("non-additive"), SLUG, [
    suite("scripts", [
      { name: "a passes", outcome: "pass" },
      { name: "b explodes", outcome: "fail" },
    ]),
  ]);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /suite "scripts": 1 failing case/);
  assert.match(result.findings[0]?.message ?? "", /b explodes/);
});

test("[01ky67bhen2xbe-evidence-execution-attestation#1] clean attested suites pass", () => {
  const result = checkExecution(spec("non-additive"), SLUG, [
    suite("scripts", [{ name: "a passes", outcome: "pass" }]),
    suite("engine", [{ name: "c passes", outcome: "pass" }]),
  ]);
  assert.equal(result.status, "pass");
  assert.match(
    result.findings[0]?.message ?? "",
    /2 suite\(s\), 2 case\(s\) executed, zero failures/,
  );
});

test("[01ky67bhen2xbe-evidence-execution-attestation#1] no attested results fails closed", () => {
  const result = checkExecution(spec("non-additive"), SLUG, []);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /no suite results attested/);
});

test("[01ky67bhen2xbe-evidence-execution-attestation#2] an additive bullet must be executed as a passing marker-named case", () => {
  const executed = checkExecution(spec("additive"), SLUG, [
    suite("scripts", [{ name: `[${SLUG}#1] it works`, outcome: "pass" }]),
  ]);
  assert.equal(executed.status, "pass");
  assert.match(executed.findings[0]?.message ?? "", /all 1 bullet\(s\) executed/);

  const commentOnly = checkExecution(spec("additive"), SLUG, [
    suite("scripts", [{ name: "it works but carries no marker", outcome: "pass" }]),
  ]);
  assert.equal(commentOnly.status, "fail");
  assert.match(commentOnly.findings[0]?.message ?? "", /bullet #1 was not executed/);
});

test("[01ky67bhen2xbe-evidence-execution-attestation#2] a failing marker-named case never satisfies its bullet", () => {
  const result = checkExecution(spec("additive"), SLUG, [
    suite("scripts", [{ name: `[${SLUG}#1] it works`, outcome: "fail" }]),
  ]);
  assert.equal(result.status, "fail");
  const messages = result.findings.map((finding) => finding.message).join("; ");
  assert.match(messages, /1 failing case/);
  assert.match(messages, /bullet #1 was not executed/);
});

test("[01ky67bhen2xbe-evidence-execution-attestation#3] exempt mandates owe no execution", () => {
  const result = checkExecution(spec("exempt"), SLUG, []);
  assert.equal(result.status, "info");
  assert.match(result.findings[0]?.message ?? "", /no execution owed/);
});
