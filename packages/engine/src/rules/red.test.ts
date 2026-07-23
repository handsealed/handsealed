import { strict as assert } from "node:assert";
import { test } from "node:test";
import { memoryFacts } from "@handsealed/facts/memory";
import type { Oid, PathChange } from "@handsealed/facts";
import type { Spec } from "../formats/spec.js";
import { checkRed, redReceiptPath } from "./red.js";

const SLUG = "01ky7p4fqhjjq9-red-attestation-and-signature-envelope-v2";
const RECEIPT_PATH = redReceiptPath(SLUG);
const CHK = "c".repeat(40);
const TEST_ROOTS = ["packages/*/src/**"];

const SPEC: Spec = {
  status: "delivered",
  evidence: "additive",
  paths: ["packages/**"],
  outcome: "Red attestation.",
  acceptance: ["first bullet", "second bullet"],
};

const TEST_FILE = "packages/engine/src/rules/red.test.ts";
const FROZEN = `test("[${SLUG}#1] a", ...); test("[${SLUG}#2] b", ...);`;

const receiptJson = (sha: string = CHK): string =>
  JSON.stringify({
    version: 1,
    sha,
    cases: [
      { name: `[${SLUG}#1] a`, outcome: "fail" },
      { name: `[${SLUG}#2] b`, outcome: "fail" },
    ],
  });

const CHANGES: readonly PathChange[] = [
  { path: `specs/${SLUG}.md`, kind: "modified" },
  { path: TEST_FILE, kind: "modified" },
  { path: "packages/engine/src/rules/red.ts", kind: "added" },
];

interface FactsOverrides {
  readonly files?: Readonly<Record<string, string>>;
  readonly changes?: Readonly<Record<string, readonly PathChange[]>>;
  readonly isAncestor?: (ancestor: Oid, descendant: Oid) => boolean;
  readonly mergeBase?: (a: Oid, b: Oid) => Oid | null;
}

function factsFor(overrides: FactsOverrides = {}) {
  return memoryFacts({
    files: {
      [`head:${RECEIPT_PATH}`]: receiptJson(),
      [`head:${TEST_FILE}`]: FROZEN,
      [`${CHK}:${TEST_FILE}`]: FROZEN,
      ...overrides.files,
    },
    changes: { [`base..${CHK}`]: [{ path: TEST_FILE, kind: "added" }], ...overrides.changes },
    isAncestor: overrides.isAncestor ?? ((ancestor) => ancestor === CHK),
    mergeBase: overrides.mergeBase ?? (() => "base"),
  });
}

test(`[01ky7p4fqhjjq9-red-attestation-and-signature-envelope-v2#3] a covering receipt at a reachable test-only checkpoint with frozen marker files passes`, async () => {
  const result = await checkRed(
    factsFor(),
    "base",
    "head",
    SPEC,
    SLUG,
    CHANGES,
    TEST_ROOTS,
    "additive",
  );
  assert.ok(result !== null);
  assert.equal(result.status, "pass");
  assert.match(result.findings[0]?.message ?? "", /red attested: 2 marked case\(s\) failed/);
  assert.match(result.findings[0]?.message ?? "", /frozen/);
});

test(`[01ky7p4fqhjjq9-red-attestation-and-signature-envelope-v2#3] a marker file edited after the red run fails the freeze`, async () => {
  const facts = factsFor({ files: { [`${CHK}:${TEST_FILE}`]: `${FROZEN} // sneaky edit` } });
  const result = await checkRed(facts, "base", "head", SPEC, SLUG, CHANGES, TEST_ROOTS, "additive");
  assert.ok(result !== null);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /edited after the red run/);
  assert.equal(result.findings[0]?.path, TEST_FILE);
});

test(`[01ky7p4fqhjjq9-red-attestation-and-signature-envelope-v2#3] a missing receipt fails under redRequired additive and stays info under off`, async () => {
  const bare = memoryFacts({ files: {} });
  const required = await checkRed(
    bare,
    "base",
    "head",
    SPEC,
    SLUG,
    CHANGES,
    TEST_ROOTS,
    "additive",
  );
  assert.ok(required !== null);
  assert.equal(required.status, "fail");
  assert.match(required.findings[0]?.message ?? "", /redRequired: additive/);
  const optional = await checkRed(bare, "base", "head", SPEC, SLUG, CHANGES, TEST_ROOTS, "off");
  assert.ok(optional !== null);
  assert.equal(optional.status, "info");
});

test("a receipt missing an acceptance marker fails coverage", async () => {
  const partial = JSON.stringify({
    version: 1,
    sha: CHK,
    cases: [{ name: `[${SLUG}#1] a`, outcome: "fail" }],
  });
  const facts = factsFor({ files: { [`head:${RECEIPT_PATH}`]: partial } });
  const result = await checkRed(facts, "base", "head", SPEC, SLUG, CHANGES, TEST_ROOTS, "additive");
  assert.ok(result !== null);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /bullet\(s\) 2/);
});

test("a checkpoint that is not an ancestor of head fails", async () => {
  const facts = factsFor({ isAncestor: () => false });
  const result = await checkRed(facts, "base", "head", SPEC, SLUG, CHANGES, TEST_ROOTS, "additive");
  assert.ok(result !== null);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /not an ancestor/);
});

test("a checkpoint touching a non-test file fails test-only", async () => {
  const facts = factsFor({
    changes: {
      [`base..${CHK}`]: [
        { path: TEST_FILE, kind: "added" },
        { path: "packages/engine/package.json", kind: "modified" },
      ],
    },
  });
  const result = await checkRed(facts, "base", "head", SPEC, SLUG, CHANGES, TEST_ROOTS, "additive");
  assert.ok(result !== null);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /test-only/);
  assert.equal(result.findings[0]?.path, "packages/engine/package.json");
});

test("an unreachable checkpoint degrades to attention, never a false fail (post-squash)", async () => {
  const facts = memoryFacts({
    files: {
      [`head:${RECEIPT_PATH}`]: receiptJson(),
      [`head:${TEST_FILE}`]: FROZEN,
    },
    // isAncestor unconfigured: the facts layer throws, as a git adapter does
    // for an object the squash-merge garbage-collected.
  });
  const result = await checkRed(facts, "base", "head", SPEC, SLUG, CHANGES, TEST_ROOTS, "additive");
  assert.ok(result !== null);
  assert.equal(result.status, "attention");
  assert.match(result.findings[0]?.message ?? "", /not reachable — structural checks only/);
});

test("an invalid receipt fails closed; a receipt on a non-additive mandate is informational", async () => {
  const broken = factsFor({ files: { [`head:${RECEIPT_PATH}`]: "not json" } });
  const result = await checkRed(broken, "base", "head", SPEC, SLUG, CHANGES, TEST_ROOTS, "off");
  assert.ok(result !== null);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /invalid red receipt/);

  const exempt: Spec = { ...SPEC, evidence: "exempt" };
  const info = await checkRed(
    factsFor(),
    "base",
    "head",
    exempt,
    SLUG,
    CHANGES,
    TEST_ROOTS,
    "additive",
  );
  assert.ok(info !== null);
  assert.equal(info.status, "info");
  assert.match(info.findings[0]?.message ?? "", /not required/);

  const silent = await checkRed(
    memoryFacts({ files: {} }),
    "base",
    "head",
    exempt,
    SLUG,
    CHANGES,
    TEST_ROOTS,
    "additive",
  );
  assert.equal(silent, null);
});

test("[01ky7x2qppcxyx-anchor-the-red-checkpoint-diff-at-the-fork-point#1] a valid receipt still verifies after the base advances past the fork point", async () => {
  // The base branch moved on (an unrelated merge) after the checkpoint was
  // cut: diffing base..checkpoint directly would sweep the base's new files
  // into the checkpoint's changes. The rule must diff from the fork point —
  // the merge base of base and checkpoint. Only the fork..checkpoint range
  // is configured, so a rule still diffing from the advanced base throws.
  const facts = memoryFacts({
    files: {
      [`head:${RECEIPT_PATH}`]: receiptJson(),
      [`head:${TEST_FILE}`]: FROZEN,
      [`${CHK}:${TEST_FILE}`]: FROZEN,
    },
    changes: { [`fork..${CHK}`]: [{ path: TEST_FILE, kind: "added" }] },
    isAncestor: (ancestor) => ancestor === CHK,
    mergeBase: (a, b) => (a === "advanced-base" && b === CHK ? "fork" : null),
  });
  const result = await checkRed(
    facts,
    "advanced-base",
    "head",
    SPEC,
    SLUG,
    CHANGES,
    TEST_ROOTS,
    "additive",
  );
  assert.ok(result !== null);
  assert.equal(result.status, "pass", result.findings[0]?.message ?? "");
  assert.match(result.findings[0]?.message ?? "", /red attested/);
});
