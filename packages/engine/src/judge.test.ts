import { strict as assert } from "node:assert";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { memoryFacts } from "@handsealed/facts/memory";
import type { PathChange } from "@handsealed/facts";
import { parseSpec } from "./formats/spec.js";
import { judge } from "./judge.js";
import { canonicalCommitments } from "./rules/authorization.js";

const SLUG = "01k0h3v8-do-thing";
const OPEN = `status: open\nevidence: additive\npaths: src/**\noutcome: Do the thing.\nacceptance:\n- It works.\n`;
const DELIVERED = OPEN.replace("status: open", "status: delivered");
const CONFIG = `version: 1\nsuites:\n  scripts:\n    run: npm test\n    results: r.json\ntestRoots:\n  - test\n`;
const FLIP = `specs/${SLUG}.md`;
const MARKED_TEST = `test("[${SLUG}#1] it works", () => {});\n`;

const factsFor = (changes: PathChange[], files: Record<string, string>) =>
  memoryFacts({ changes, files });

test("implementation lane composes lane, binding, authorization, ceiling, evidence, and acceptance", async () => {
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "src/a.ts", kind: "modified" },
      { path: "test/a.test.ts", kind: "added" },
    ],
    {
      [`b:${FLIP}`]: OPEN,
      [`h:${FLIP}`]: DELIVERED,
      "b:.handsealed.yml": CONFIG,
      "h:test/a.test.ts": MARKED_TEST,
    },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  assert.deepEqual(
    verdicts.rules.map((r) => r.rule),
    ["lane", "binding", "authorization", "ceiling", "evidence", "acceptance"],
  );
});

test("adversarial: unclaimed acceptance bullets fail an additive mandate", async () => {
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "test/a.test.ts", kind: "added" },
    ],
    {
      [`b:${FLIP}`]: OPEN,
      [`h:${FLIP}`]: DELIVERED,
      "b:.handsealed.yml": CONFIG,
      "h:test/a.test.ts": 'test("no markers here", () => {});\n',
    },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "fail");
  const acceptance = verdicts.rules.find((r) => r.rule === "acceptance");
  assert.match(acceptance?.findings[0]?.message ?? "", /unclaimed/);
});

test("a missing config skips ceiling and evidence, loudly", async () => {
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "src/a.ts", kind: "modified" },
    ],
    { [`b:${FLIP}`]: OPEN, [`h:${FLIP}`]: DELIVERED },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  assert.deepEqual(
    verdicts.rules.map((r) => r.rule),
    ["lane", "binding", "config"],
  );
  assert.match(verdicts.rules[2]?.findings[0]?.message ?? "", /checks skipped/);
});

test("an invalid base config fails closed", async () => {
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "src/a.ts", kind: "modified" },
    ],
    {
      [`b:${FLIP}`]: OPEN,
      [`h:${FLIP}`]: DELIVERED,
      "b:.handsealed.yml": "version: 2\n",
    },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "fail");
  const config = verdicts.rules.find((r) => r.rule === "config");
  assert.equal(config?.status, "fail");
  assert.match(config?.findings[0]?.message ?? "", /base config invalid/);
});

test("[01ky2z5m3a9dfe-harden-the-judge-against-reopen-and-config-edits#2] adversarial: a change cannot loosen its own rulebook — the config is judged at base", async () => {
  const permissive = CONFIG.replace("  - test", "  - outside");
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "outside/b.ts", kind: "added" },
      { path: ".handsealed.yml", kind: "modified" },
    ],
    {
      [`b:${FLIP}`]: OPEN,
      [`h:${FLIP}`]: DELIVERED,
      "b:.handsealed.yml": CONFIG,
      "h:.handsealed.yml": permissive,
    },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "fail");
  const config = verdicts.rules.find((r) => r.rule === "config");
  assert.equal(config?.status, "attention");
  assert.match(config?.findings[0]?.message ?? "", /judged with the base config/);
  const ceiling = verdicts.rules.find((r) => r.rule === "ceiling");
  assert.equal(ceiling?.status, "fail");
  assert.equal(
    ceiling?.findings.some((f) => f.path === "outside/b.ts"),
    true,
  );
});

test("config introduced in the diff takes effect only after merge", async () => {
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "src/a.ts", kind: "modified" },
      { path: ".handsealed.yml", kind: "added" },
    ],
    { [`b:${FLIP}`]: OPEN, [`h:${FLIP}`]: DELIVERED, "h:.handsealed.yml": CONFIG },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  const config = verdicts.rules.find((r) => r.rule === "config");
  assert.equal(config?.status, "info");
  assert.equal(
    config?.findings.some((f) => f.message.includes("takes effect after merge")),
    true,
  );
});

test("[01ky4qawgtx2rs-code-owner-signed-authorization#3] allowedSigners come from the base config, so a change cannot authorize itself by adding a signer", async () => {
  const headAddsSigner = `${CONFIG}allowedSigners:\n  - name: sneaky\n    key: 3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29\n`;
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "src/a.ts", kind: "modified" },
      { path: "test/a.test.ts", kind: "added" },
      { path: ".handsealed.yml", kind: "modified" },
    ],
    {
      [`b:${FLIP}`]: OPEN,
      [`h:${FLIP}`]: DELIVERED,
      "b:.handsealed.yml": CONFIG,
      "h:.handsealed.yml": headAddsSigner,
      "h:test/a.test.ts": MARKED_TEST,
    },
  );
  const verdicts = await judge(facts, "b", "h");
  const authorization = verdicts.rules.find((r) => r.rule === "authorization");
  assert.equal(authorization?.status, "info");
  assert.match(authorization?.findings[0]?.message ?? "", /not enforced/);
});

test("spec lane runs spec validation only", async () => {
  const facts = factsFor([{ path: FLIP, kind: "added" }], { [`h:${FLIP}`]: OPEN });
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  assert.deepEqual(
    verdicts.rules.map((r) => r.rule),
    ["lane", "spec-lane"],
  );
});

test("an amendment (lone modified spec, still open) stays in the spec lane", async () => {
  const amended = OPEN.replace("Do the thing.", "Do the amended thing.");
  const facts = factsFor([{ path: FLIP, kind: "modified" }], {
    [`b:${FLIP}`]: OPEN,
    [`h:${FLIP}`]: amended,
  });
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  assert.deepEqual(
    verdicts.rules.map((r) => r.rule),
    ["lane", "spec-lane"],
  );
});

test("[01ky2z5m3a9dfe-harden-the-judge-against-reopen-and-config-edits#1] adversarial: a delivered mandate cannot be reopened through the spec lane", async () => {
  const facts = factsFor([{ path: FLIP, kind: "modified" }], {
    [`b:${FLIP}`]: DELIVERED,
    [`h:${FLIP}`]: OPEN,
  });
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "fail");
  const specLane = verdicts.rules.find((r) => r.rule === "spec-lane");
  assert.match(specLane?.findings[0]?.message ?? "", /immutable history/);
});

test("a flip-only delivery (the exempt shape) routes to the implementation lane", async () => {
  const exemptOpen = OPEN.replace("evidence: additive", "evidence: exempt").replace(
    "paths: src/**\n",
    "",
  );
  const exemptDelivered = exemptOpen.replace("status: open", "status: delivered");
  const facts = factsFor([{ path: FLIP, kind: "modified" }], {
    [`b:${FLIP}`]: exemptOpen,
    [`h:${FLIP}`]: exemptDelivered,
    "b:.handsealed.yml": CONFIG,
  });
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  assert.deepEqual(
    verdicts.rules.map((r) => r.rule),
    ["lane", "binding", "authorization", "ceiling", "evidence"],
  );
  assert.match(verdicts.rules[0]?.findings[0]?.message ?? "", /flip-only change routed/);
});

test("maintenance lane is lane-only", async () => {
  const facts = factsFor([{ path: ".github/workflows/ci.yml", kind: "modified" }], {});
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  assert.deepEqual(
    verdicts.rules.map((r) => r.rule),
    ["lane"],
  );
});

// --- signed one-shot delivery ---

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const OWNER_KEY = Buffer.from(String(publicKey.export({ format: "jwk" }).x), "base64url").toString(
  "base64",
);
const SIGNED_CONFIG = `${CONFIG}allowedSigners:\n  - name: owner\n    key: ${OWNER_KEY}\n`;
const ONESHOT_SLUG = "01k0h3va-one-shot";
const ONESHOT_MD = `specs/${ONESHOT_SLUG}.md`;
const ONESHOT_SIG = `specs/${ONESHOT_SLUG}.sig`;
const ONESHOT = `status: delivered\nevidence: additive\npaths: src/**\noutcome: One shot.\nacceptance:\n- It lands.\n`;
const oneshotSpec = () => {
  const parsed = parseSpec(ONESHOT);
  if (!parsed.ok) throw new Error("fixture spec must parse");
  return parsed.value;
};
const OWNER_SIG = sign(
  null,
  canonicalCommitments(ONESHOT_SLUG, oneshotSpec()),
  privateKey,
).toString("base64");
const ONESHOT_CHANGES: PathChange[] = [
  { path: ONESHOT_MD, kind: "added" },
  { path: ONESHOT_SIG, kind: "added" },
  { path: "src/a.ts", kind: "modified" },
  { path: "test/a.test.ts", kind: "added" },
];
const oneshotFiles = () => ({
  "b:.handsealed.yml": SIGNED_CONFIG,
  [`h:${ONESHOT_MD}`]: ONESHOT,
  [`h:${ONESHOT_SIG}`]: OWNER_SIG,
  "h:test/a.test.ts": `test("[${ONESHOT_SLUG}#1] it lands", () => {});\n`,
});

test("[01ky58xnhgf9gw-signed-one-shot-delivery#1] a signed one-shot delivery passes end-to-end", async () => {
  const facts = factsFor(ONESHOT_CHANGES, oneshotFiles());
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  assert.deepEqual(
    verdicts.rules.map((r) => r.rule),
    ["lane", "binding", "authorization", "ceiling", "evidence", "acceptance"],
  );
  const authorization = verdicts.rules.find((r) => r.rule === "authorization");
  assert.match(authorization?.findings[0]?.message ?? "", /authorized by owner/);
});

test("[01ky58xnhgf9gw-signed-one-shot-delivery#3] the one-shot mandate's own signature is ceiling-exempt", async () => {
  const facts = factsFor(ONESHOT_CHANGES, oneshotFiles());
  const verdicts = await judge(facts, "b", "h");
  const ceiling = verdicts.rules.find((r) => r.rule === "ceiling");
  assert.equal(ceiling?.status, "pass");
});

test("[01ky58xnhgf9gw-signed-one-shot-delivery#2] adversarial: an unsigned one-shot is refused", async () => {
  const files = oneshotFiles();
  const { [`h:${ONESHOT_SIG}`]: _dropped, ...withoutSig } = files;
  const facts = factsFor(
    ONESHOT_CHANGES.filter((change) => change.path !== ONESHOT_SIG),
    withoutSig,
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "fail");
  const authorization = verdicts.rules.find((r) => r.rule === "authorization");
  assert.match(authorization?.findings[0]?.message ?? "", /no code-owner signature/);
});

test("[01ky58xnhgf9gw-signed-one-shot-delivery#2] adversarial: a tampered one-shot signature is refused", async () => {
  const files = { ...oneshotFiles(), [`h:${ONESHOT_SIG}`]: Buffer.alloc(64, 7).toString("base64") };
  const facts = factsFor(ONESHOT_CHANGES, files);
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "fail");
  const authorization = verdicts.rules.find((r) => r.rule === "authorization");
  assert.match(authorization?.findings[0]?.message ?? "", /no allowed signer/);
});

test("[01ky58xnhgf9gw-signed-one-shot-delivery#2] adversarial: one-shot without configured signers is refused", async () => {
  const files = { ...oneshotFiles(), "b:.handsealed.yml": CONFIG };
  const facts = factsFor(ONESHOT_CHANGES, files);
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "fail");
  const authorization = verdicts.rules.find((r) => r.rule === "authorization");
  assert.match(authorization?.findings[0]?.message ?? "", /requires configured allowedSigners/);
});

test("[01ky58xnhgf9gw-signed-one-shot-delivery#2] adversarial: one-shot with no base config is refused fail-closed", async () => {
  const { "b:.handsealed.yml": _dropped, ...files } = oneshotFiles();
  const facts = factsFor(ONESHOT_CHANGES, files);
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "fail");
  const authorization = verdicts.rules.find((r) => r.rule === "authorization");
  assert.match(authorization?.findings[0]?.message ?? "", /requires a base config/);
});

test("[01ky58xnhgf9gw-signed-one-shot-delivery#3] the spec lane accepts a mandate with its signature companion", async () => {
  const facts = factsFor(
    [
      { path: ONESHOT_MD, kind: "added" },
      { path: ONESHOT_SIG, kind: "added" },
    ],
    {
      [`h:${ONESHOT_MD}`]: ONESHOT.replace("status: delivered", "status: open"),
      [`h:${ONESHOT_SIG}`]: OWNER_SIG,
    },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  const specLane = verdicts.rules.find((r) => r.rule === "spec-lane");
  assert.match(specLane?.findings[0]?.message ?? "", /1 signature companion/);
});

// --- exempt paths (maintenance-lane trivia) ---

const EXEMPT_CONFIG = `${CONFIG}exemptPaths:\n  - "docs/**"\n  - "*.md"\n`;

test("[01ky6366kq7a86-exempt-paths-for-the-maintenance-lane#1] a docs-only change under exemptPaths is the maintenance lane, no mandate", async () => {
  const facts = factsFor(
    [
      { path: "docs/guide.md", kind: "modified" },
      { path: "README.md", kind: "added" },
    ],
    { "b:.handsealed.yml": EXEMPT_CONFIG },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass");
  assert.deepEqual(
    verdicts.rules.map((r) => r.rule),
    ["lane"],
  );
  assert.equal(verdicts.rules[0]?.title, "Lane: maintenance");
});

test("[01ky6366kq7a86-exempt-paths-for-the-maintenance-lane#2] exempt files ride an implementation change outside ceiling and evidence", async () => {
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "src/a.ts", kind: "modified" },
      { path: "docs/guide.md", kind: "modified" },
      { path: "test/a.test.ts", kind: "added" },
    ],
    {
      [`b:${FLIP}`]: OPEN,
      [`h:${FLIP}`]: DELIVERED,
      "b:.handsealed.yml": EXEMPT_CONFIG,
      "h:test/a.test.ts": MARKED_TEST,
    },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "pass", JSON.stringify(verdicts.rules));
  const ceiling = verdicts.rules.find((r) => r.rule === "ceiling");
  assert.equal(ceiling?.status, "pass");
  const evidence = verdicts.rules.find((r) => r.rule === "evidence");
  assert.match(evidence?.findings[0]?.message ?? "", /1 test file/);
});

test("[01ky6366kq7a86-exempt-paths-for-the-maintenance-lane#2] the .github fence still refuses implementation riders", async () => {
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "src/a.ts", kind: "modified" },
      { path: ".github/workflows/ci.yml", kind: "modified" },
    ],
    { [`b:${FLIP}`]: OPEN, [`h:${FLIP}`]: DELIVERED, "b:.handsealed.yml": EXEMPT_CONFIG },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "fail");
  assert.match(verdicts.rules[0]?.findings[0]?.message ?? "", /may not touch workflows/);
});

test("[01ky6366kq7a86-exempt-paths-for-the-maintenance-lane#3] a config without exemptPaths behaves exactly as before", async () => {
  const facts = factsFor([{ path: "docs/guide.md", kind: "modified" }], {
    "b:.handsealed.yml": CONFIG,
  });
  const verdicts = await judge(facts, "b", "h");
  assert.equal(verdicts.overall, "fail");
  const binding = verdicts.rules.find((r) => r.rule === "binding");
  assert.match(binding?.findings[0]?.message ?? "", /no mandate/);
});

// --- evidence execution (attested results) ---

test("[01ky67bhen2xbe-evidence-execution-attestation#1] attested results add the execution rule to the verdict", async () => {
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "src/a.ts", kind: "modified" },
      { path: "test/a.test.ts", kind: "added" },
    ],
    {
      [`b:${FLIP}`]: OPEN,
      [`h:${FLIP}`]: DELIVERED,
      "b:.handsealed.yml": CONFIG,
      "h:test/a.test.ts": MARKED_TEST,
    },
  );
  const results = [
    {
      version: 1 as const,
      suite: "scripts",
      cases: [{ name: `[${SLUG}#1] it works`, outcome: "pass" as const }],
    },
  ];
  const verdicts = await judge(facts, "b", "h", { results });
  assert.equal(verdicts.overall, "pass");
  assert.deepEqual(
    verdicts.rules.map((r) => r.rule),
    ["lane", "binding", "authorization", "ceiling", "evidence", "acceptance", "execution"],
  );
});

test("[01ky67bhen2xbe-evidence-execution-attestation#3] verify without results keeps the verdict exactly as today", async () => {
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "src/a.ts", kind: "modified" },
      { path: "test/a.test.ts", kind: "added" },
    ],
    {
      [`b:${FLIP}`]: OPEN,
      [`h:${FLIP}`]: DELIVERED,
      "b:.handsealed.yml": CONFIG,
      "h:test/a.test.ts": MARKED_TEST,
    },
  );
  const verdicts = await judge(facts, "b", "h");
  assert.deepEqual(
    verdicts.rules.map((r) => r.rule),
    ["lane", "binding", "authorization", "ceiling", "evidence", "acceptance"],
  );
});

test("[01ky67bhen2xbe-evidence-execution-attestation#2] adversarial: attested results without the executed marker fail the delivery", async () => {
  const facts = factsFor(
    [
      { path: FLIP, kind: "modified" },
      { path: "src/a.ts", kind: "modified" },
      { path: "test/a.test.ts", kind: "added" },
    ],
    {
      [`b:${FLIP}`]: OPEN,
      [`h:${FLIP}`]: DELIVERED,
      "b:.handsealed.yml": CONFIG,
      "h:test/a.test.ts": MARKED_TEST,
    },
  );
  const results = [
    {
      version: 1 as const,
      suite: "scripts",
      cases: [{ name: "unrelated green test", outcome: "pass" as const }],
    },
  ];
  const verdicts = await judge(facts, "b", "h", { results });
  assert.equal(verdicts.overall, "fail");
  const execution = verdicts.rules.find((r) => r.rule === "execution");
  assert.match(execution?.findings[0]?.message ?? "", /not executed/);
});
