import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkAuthorization, parseSpec } from "@handsealed/engine";
import { memoryFacts } from "@handsealed/facts/memory";
import { generateSigningKey, specSign } from "./spec-sign.js";

const MANDATE = `status: open
evidence: additive
paths: packages/**
outcome: A mandate to sign.
acceptance:
- one
- two
`;

const scratch = (): string => mkdtempSync(join(tmpdir(), "handsealed-sign-"));

test("[01ky4s3m2j4mcc-spec-sign-cli-for-code-owners#1] keygen mints an Ed25519 keypair", () => {
  const { privateKeyPem, publicKey } = generateSigningKey();
  assert.match(privateKeyPem, /BEGIN PRIVATE KEY/);
  assert.equal(Buffer.from(publicKey, "base64").length, 32);
});

test("[01ky4s3m2j4mcc-spec-sign-cli-for-code-owners#2] spec sign writes a signature over the mandate's commitments", () => {
  const dir = scratch();
  try {
    const slug = "01ky4s3m2j4mcc-example";
    writeFileSync(join(dir, `${slug}.md`), MANDATE);
    const keyPath = join(dir, "key.pem");
    writeFileSync(keyPath, generateSigningKey().privateKeyPem);
    const sigPath = specSign(slug, { dir, keyPath });
    assert.equal(sigPath, join(dir, `${slug}.sig`));
    assert.equal(Buffer.from(readFileSync(sigPath, "utf8").trim(), "base64").length, 64);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[01ky4s3m2j4mcc-spec-sign-cli-for-code-owners#2] spec sign refuses a missing mandate", () => {
  const dir = scratch();
  try {
    const keyPath = join(dir, "key.pem");
    writeFileSync(keyPath, generateSigningKey().privateKeyPem);
    assert.throws(() => specSign("01ky4s3m2j4mcc-nope", { dir, keyPath }), /mandate not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[01ky4s3m2j4mcc-spec-sign-cli-for-code-owners#3] a signature spec sign produces is accepted by the authorization rule", async () => {
  const dir = scratch();
  try {
    const slug = "01ky4s3m2j4mcc-roundtrip";
    writeFileSync(join(dir, `${slug}.md`), MANDATE);
    const { privateKeyPem, publicKey } = generateSigningKey();
    const keyPath = join(dir, "key.pem");
    writeFileSync(keyPath, privateKeyPem);
    const sig = readFileSync(specSign(slug, { dir, keyPath }), "utf8");

    const parsed = parseSpec(MANDATE);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const facts = memoryFacts({ changes: [], files: { [`b:specs/${slug}.sig`]: sig } });
    const verdict = await checkAuthorization(facts, "b", parsed.value, slug, [
      { name: "owner", key: publicKey },
    ]);
    assert.equal(verdict.status, "pass");
    assert.match(verdict.findings[0]?.message ?? "", /authorized by owner/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
