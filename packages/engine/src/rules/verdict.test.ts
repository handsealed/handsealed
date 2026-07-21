import { strict as assert } from "node:assert";
import { test } from "node:test";
import { collectVerdicts, renderMarkdown, verdict } from "./verdict.js";

test("overall fails when any rule fails; attention and info never gate", () => {
  const pass = collectVerdicts([
    verdict("lane", "Lane", "pass"),
    verdict("cardinality", "Suite cardinality", "attention"),
    verdict("config", "Config", "info"),
  ]);
  assert.equal(pass.overall, "pass");
  const fail = collectVerdicts([
    verdict("lane", "Lane", "pass"),
    verdict("binding", "Mandate binding", "fail"),
  ]);
  assert.equal(fail.overall, "fail");
});

test("markdown rendering is deterministic and complete", () => {
  const rendered = renderMarkdown(
    collectVerdicts([
      verdict("binding", "Mandate binding", "pass", [
        { message: "flip is byte-clean", path: "specs/01k0h3v8-a.md" },
      ]),
      verdict("ceiling", "Scope ceiling", "fail", [
        { message: "out of mandate", path: "apps/backend/lib/payout.ex" },
      ]),
      verdict("cardinality", "Suite cardinality", "attention", [
        { message: 'suite "backend" shrank: 412 → 268' },
      ]),
    ]),
  );
  assert.equal(
    rendered,
    [
      "## Handsealed verdict: ✗ FAIL",
      "",
      "### ✓ Mandate binding",
      "- flip is byte-clean — `specs/01k0h3v8-a.md`",
      "",
      "### ✗ Scope ceiling",
      "- out of mandate — `apps/backend/lib/payout.ex`",
      "",
      "### ⚠ Suite cardinality",
      '- suite "backend" shrank: 412 → 268',
      "",
    ].join("\n"),
  );
});

test("the JSON form is stable", () => {
  const verdicts = collectVerdicts([verdict("lane", "Lane", "pass", [{ message: "m" }])]);
  assert.equal(
    JSON.stringify(verdicts),
    '{"overall":"pass","rules":[{"rule":"lane","title":"Lane","status":"pass","findings":[{"message":"m"}]}]}',
  );
});
