import { strict as assert } from "node:assert";
import { test } from "node:test";
import { memoryFacts } from "@handsealed/facts/memory";
import type { AllowedSigner } from "../formats/config.js";
import type { Spec } from "../formats/spec.js";
import { canonicalCommitments, checkAuthorization } from "./authorization.js";

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
