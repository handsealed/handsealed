import { strict as assert } from "node:assert";
import { test } from "node:test";
import { memoryFacts } from "@handsealed/facts/memory";
import type { AllowedSigner } from "../formats/config.js";
import type { Spec } from "../formats/spec.js";
import { canonicalCommitments, checkAuthorization } from "./authorization.js";

import {
  FIXTURE_COMMITMENTS,
  FIXTURE_PUB1,
  FIXTURE_SIG_GOOD,
  FIXTURE_SIG_STRANGER,
  FIXTURE_SIG_WRONG_NAMESPACE,
  FIXTURE_SLUG,
  FIXTURE_SPEC,
} from "../formats/sshsig.fixtures.js";

const SLUG = "01ky4qawgtx2rs-code-owner-signed-authorization";
const SIG_PATH = `specs/${SLUG}.sig`;

const SPEC: Spec = {
  status: "delivered",
  evidence: "additive",
  paths: ["packages/**"],
  outcome: "Prove signed authorization.",
  acceptance: ["the first bullet", "the second bullet"],
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function newSigner(name: string): Promise<{ signer: AllowedSigner; pair: CryptoKeyPair }> {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { signer: { name, key: toBase64(raw) }, pair };
}

async function sign(pair: CryptoKeyPair, message: Uint8Array<ArrayBuffer>): Promise<string> {
  const signature = await crypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, message);
  return toBase64(new Uint8Array(signature));
}

const factsWith = (sig: string | null) =>
  memoryFacts({ changes: [], files: sig === null ? {} : { [`b:${SIG_PATH}`]: sig } });

test("[01ky4qawgtx2rs-code-owner-signed-authorization#1] a valid signature by an allowed signer authorizes the flip", async () => {
  const { signer, pair } = await newSigner("zygimantas");
  const sig = await sign(pair, canonicalCommitments(SLUG, SPEC));
  const result = await checkAuthorization(factsWith(sig), "b", SPEC, SLUG, [signer]);
  assert.equal(result.status, "pass");
  assert.match(result.findings[0]?.message ?? "", /authorized by zygimantas/);
});

test("[01ky4qawgtx2rs-code-owner-signed-authorization#2] a missing signature is unauthorized", async () => {
  const { signer } = await newSigner("zygimantas");
  const result = await checkAuthorization(factsWith(null), "b", SPEC, SLUG, [signer]);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /no code-owner signature/);
});

test("[01ky4qawgtx2rs-code-owner-signed-authorization#2] a signature by a key absent from allowedSigners is unauthorized", async () => {
  const outsider = await newSigner("outsider");
  const allowed = await newSigner("zygimantas");
  const sig = await sign(outsider.pair, canonicalCommitments(SLUG, SPEC));
  const result = await checkAuthorization(factsWith(sig), "b", SPEC, SLUG, [allowed.signer]);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /no allowed signer/);
});

test("[01ky4qawgtx2rs-code-owner-signed-authorization#2] a well-formed but invalid signature is unauthorized", async () => {
  const { signer } = await newSigner("zygimantas");
  const notASignature = toBase64(new Uint8Array(64));
  const result = await checkAuthorization(factsWith(notASignature), "b", SPEC, SLUG, [signer]);
  assert.equal(result.status, "fail");
});

test("[01ky4qawgtx2rs-code-owner-signed-authorization#4] a signature over the original commitments does not authorize a tampered mandate", async () => {
  const { signer, pair } = await newSigner("zygimantas");
  const original = await sign(pair, canonicalCommitments(SLUG, SPEC));
  const tampered: Spec = {
    ...SPEC,
    acceptance: [...SPEC.acceptance, "and quietly grant more scope"],
  };
  const result = await checkAuthorization(factsWith(original), "b", tampered, SLUG, [signer]);
  assert.equal(result.status, "fail");
});

test("with no allowedSigners configured, authorization is stated but not enforced", async () => {
  const result = await checkAuthorization(factsWith(null), "b", SPEC, SLUG, []);
  assert.equal(result.status, "info");
  assert.match(result.findings[0]?.message ?? "", /not enforced/);
});

test("canonicalCommitments is stable and excludes status", () => {
  const open = new TextDecoder().decode(canonicalCommitments(SLUG, { ...SPEC, status: "open" }));
  const delivered = new TextDecoder().decode(canonicalCommitments(SLUG, SPEC));
  assert.equal(open, delivered);
  assert.match(open, /^handsealed-authorization\/v1\n/);
});

// --- the v2 SSHSIG envelope (fixtures are real ssh-keygen output) ---

const V2_SLUG = "01ky7p4fqhjjq9-red-attestation-and-signature-envelope-v2";
const FIXTURE_SIG_PATH = `specs/${FIXTURE_SLUG}.sig`;
const FIXTURE_SIGNER: AllowedSigner = { name: "zygimantas", key: FIXTURE_PUB1 };

const envelopeFacts = (sig: string) =>
  memoryFacts({ changes: [], files: { [`b:${FIXTURE_SIG_PATH}`]: sig } });

test(`[01ky7p4fqhjjq9-red-attestation-and-signature-envelope-v2#1] an SSHSIG envelope by an allowed signer authorizes and names the signer`, async () => {
  const commitments = new TextDecoder().decode(canonicalCommitments(FIXTURE_SLUG, FIXTURE_SPEC));
  assert.equal(commitments, FIXTURE_COMMITMENTS);
  const result = await checkAuthorization(
    envelopeFacts(FIXTURE_SIG_GOOD),
    "b",
    FIXTURE_SPEC,
    FIXTURE_SLUG,
    [FIXTURE_SIGNER],
  );
  assert.equal(result.status, "pass");
  assert.match(result.findings[0]?.message ?? "", /authorized by zygimantas/);
});

test(`[01ky7p4fqhjjq9-red-attestation-and-signature-envelope-v2#1] any allowed block in a multi-signature envelope authorizes`, async () => {
  const result = await checkAuthorization(
    envelopeFacts(`${FIXTURE_SIG_STRANGER}${FIXTURE_SIG_GOOD}`),
    "b",
    FIXTURE_SPEC,
    FIXTURE_SLUG,
    [FIXTURE_SIGNER],
  );
  assert.equal(result.status, "pass");
  assert.match(result.findings[0]?.message ?? "", /authorized by zygimantas/);
});

test("adversarial: a wrong-namespace envelope never authorizes (cross-protocol reuse)", async () => {
  const result = await checkAuthorization(
    envelopeFacts(FIXTURE_SIG_WRONG_NAMESPACE),
    "b",
    FIXTURE_SPEC,
    FIXTURE_SLUG,
    [FIXTURE_SIGNER],
  );
  assert.equal(result.status, "fail");
  assert.ok(result.findings.some((finding) => /namespace "file"/.test(finding.message)));
});

test("adversarial: an envelope by a key outside allowedSigners is unauthorized", async () => {
  const result = await checkAuthorization(
    envelopeFacts(FIXTURE_SIG_STRANGER),
    "b",
    FIXTURE_SPEC,
    FIXTURE_SLUG,
    [FIXTURE_SIGNER],
  );
  assert.equal(result.status, "fail");
  assert.ok(result.findings.some((finding) => /not an allowed signer/.test(finding.message)));
});

test("adversarial: an envelope does not authorize tampered commitments", async () => {
  const tampered: Spec = {
    ...FIXTURE_SPEC,
    acceptance: [...FIXTURE_SPEC.acceptance, "and quietly grant more scope"],
  };
  const result = await checkAuthorization(
    envelopeFacts(FIXTURE_SIG_GOOD),
    "b",
    tampered,
    FIXTURE_SLUG,
    [FIXTURE_SIGNER],
  );
  assert.equal(result.status, "fail");
});

test(`[01ky7p4fqhjjq9-red-attestation-and-signature-envelope-v2#2] a bare v1 base64 signature and a raw base64 signer key keep authorizing`, async () => {
  const { signer, pair } = await newSigner("zygimantas");
  const sig = await sign(pair, canonicalCommitments(SLUG, SPEC));
  const result = await checkAuthorization(factsWith(sig), "b", SPEC, SLUG, [signer]);
  assert.equal(result.status, "pass");
  assert.match(result.findings[0]?.message ?? "", /authorized by zygimantas/);
});
