import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isValidSpecFilename, parseSpec, printSpec } from "./spec.js";

const VALID = `status: open
evidence: additive
paths: apps/frontend/** apps/backend/lib/**
outcome: Show coin changes on the match result screen so players see what they earned.
acceptance:
- The result screen shows the coin delta for the local player.
- A zero delta renders as +0, never blank.
`;

test("parses a valid spec", () => {
  const result = parseSpec(VALID);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.status, "open");
  assert.equal(result.value.evidence, "additive");
  assert.deepEqual(result.value.paths, ["apps/frontend/**", "apps/backend/lib/**"]);
  assert.equal(result.value.acceptance.length, 2);
  assert.equal(result.value.smoke, undefined);
});

test("parses optional smoke and folds a wrapped outcome", () => {
  const source = `status: delivered
evidence: exempt
smoke: verified on a physical device
outcome: A paragraph that wraps
  across two lines.
acceptance:
- One bullet.
`;
  const result = parseSpec(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.smoke, "verified on a physical device");
  assert.equal(result.value.outcome, "A paragraph that wraps across two lines.");
});

test("round-trip stability: parse(print(parse(x))) equals parse(x)", () => {
  const first = parseSpec(VALID);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const printed = printSpec(first.value);
  const second = parseSpec(printed);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.deepEqual(second.value, first.value);
  assert.equal(printSpec(second.value), printed);
});

const INVALID: Array<{ name: string; source: string; expect: string; line?: number }> = [
  {
    name: "missing status",
    source: "evidence: additive\noutcome: x\nacceptance:\n- y\n",
    expect: 'before required field "status"',
  },
  {
    name: "invalid status",
    source: VALID.replace("status: open", "status: closed"),
    expect: 'invalid status "closed"',
  },
  {
    name: "invalid evidence",
    source: VALID.replace("evidence: additive", "evidence: vibes"),
    expect: 'invalid evidence "vibes"',
  },
  {
    name: "duplicate field",
    source: `status: open\nstatus: open\n${VALID.split("\n").slice(1).join("\n")}`,
    expect: 'duplicate field "status"',
    line: 2,
  },
  {
    name: "unknown field",
    source: VALID.replace("paths:", "scope:"),
    expect: 'unknown field "scope"',
    line: 3,
  },
  {
    name: "out of order",
    source: `evidence: additive\nstatus: open\noutcome: x\nacceptance:\n- y\n`,
    expect: "out of canonical order",
    line: 2,
  },
  {
    name: "empty outcome",
    source: VALID.replace(/outcome: .*/, "outcome:"),
    expect: '"outcome" must not be empty',
  },
  {
    name: "inline acceptance value",
    source: VALID.replace("acceptance:", "acceptance: all good"),
    expect: "takes no inline value",
  },
  {
    name: "no bullets",
    source: VALID.split("\n").slice(0, 5).join("\n") + "\n",
    expect: "at least one bullet",
  },
  {
    name: "empty bullet",
    source: VALID.replace("- A zero delta renders as +0, never blank.", "- "),
    expect: "empty acceptance bullet",
  },
  {
    name: "bullet outside acceptance",
    source: `- stray\n${VALID}`,
    expect: "bullet outside the acceptance section",
    line: 1,
  },
  {
    name: "unrecognized line",
    source: VALID.replace("acceptance:", "\njust some prose\nacceptance:"),
    expect: "unrecognized line",
  },
  {
    name: "empty paths",
    source: VALID.replace(/paths: .*/, "paths:"),
    expect: '"paths" must not be empty',
  },
  { name: "missing everything", source: "\n", expect: 'missing required field "status"' },
];

for (const fixture of INVALID) {
  test(`rejects: ${fixture.name}`, () => {
    const result = parseSpec(fixture.source);
    assert.equal(result.ok, false, "expected failure");
    if (result.ok) return;
    const hit = result.issues.find((i) => i.message.includes(fixture.expect));
    assert.notEqual(
      hit,
      undefined,
      `no issue matching "${fixture.expect}" in: ${result.issues.map((i) => i.message).join(" | ")}`,
    );
    if (fixture.line !== undefined && hit !== undefined) assert.equal(hit.line, fixture.line);
  });
}

test("spec filenames: sortable base32 prefix + kebab slug", () => {
  for (const good of [
    "01k0h3v8-match-coin-toast.md",
    "01hzxw2p9qk4-fix-login.md",
    "abcdefgh-a.md",
  ]) {
    assert.equal(isValidSpecFilename(good), true, good);
  }
  for (const bad of [
    "42-feature.md",
    "01K0H3V8-upper.md",
    "01k0h3v8_snake.md",
    "01k0h3v8-.md",
    "01k0h3v8-slug.txt",
    "01k0h3vi-has-i.md",
    "specs/01k0h3v8-nested.md",
  ]) {
    assert.equal(isValidSpecFilename(bad), false, bad);
  }
});
