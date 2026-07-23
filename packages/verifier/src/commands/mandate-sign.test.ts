import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkAuthorization, parseMandate, parseSshSignatures } from "@handsealed/engine";
import { memoryFacts } from "@handsealed/facts/memory";
import { generateSigningKey, signMandate } from "./mandate-sign.js";

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

test("[01ky4s3m2j4mcc-spec-sign-cli-for-code-owners#2] spec sign writes an SSHSIG envelope over the mandate's commitments", () => {
  const dir = scratch();
  try {
    const slug = "01ky4s3m2j4mcc-example";
    writeFileSync(join(dir, `${slug}.md`), MANDATE);
    const keyPath = join(dir, "key.pem");
    writeFileSync(keyPath, generateSigningKey().privateKeyPem);
    const sigPath = signMandate(slug, { dir, keyPath });
    assert.equal(sigPath, join(dir, `${slug}.sig`));
    const envelope = readFileSync(sigPath, "utf8");
    assert.match(envelope, /-----BEGIN SSH SIGNATURE-----/);
    const parsed = parseSshSignatures(envelope);
    assert.ok(parsed.ok, parsed.ok ? "" : parsed.issue);
    assert.equal(parsed.blocks[0]?.namespace, "handsealed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[01ky4s3m2j4mcc-spec-sign-cli-for-code-owners#2] spec sign refuses a missing mandate", () => {
  const dir = scratch();
  try {
    const keyPath = join(dir, "key.pem");
    writeFileSync(keyPath, generateSigningKey().privateKeyPem);
    assert.throws(() => signMandate("01ky4s3m2j4mcc-nope", { dir, keyPath }), /mandate not found/);
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
    const sig = readFileSync(signMandate(slug, { dir, keyPath }), "utf8");

    const parsed = parseMandate(MANDATE);
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
