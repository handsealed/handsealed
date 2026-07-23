import { strict as assert } from "node:assert";
import { test } from "node:test";
import { memoryFacts } from "@handsealed/facts/memory";
import type { AllowedSigner } from "../formats/config.js";
import type { Spec } from "../formats/spec.js";
import { canonicalCommitments, checkAuthorization } from "./authorization.js";
import { validateSpecLane } from "./spec-lane.js";

const SLUG = "01ky4qawgtx2rs-code-owner-signed-authorization";
const SIG_PATH = `specs/${SLUG}.sig`;

const SPEC: Spec = {
  status: "delivered",
  evidence: "additive",
  paths: ["packages/**"],
  outcome: "X.",
  acceptance: ["one"],
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

test("[01ky80j7en0439-drop-the-v1-bare-signature-format#1] a bare base64 signature no longer authorizes", async () => {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const signer: AllowedSigner = { name: "owner", key: toBase64(raw) };
  const signature = toBase64(
    new Uint8Array(
      await crypto.subtle.sign(
        { name: "Ed25519" },
        pair.privateKey,
        canonicalCommitments(SLUG, SPEC),
      ),
    ),
  );
  const facts = memoryFacts({ changes: [], files: { [`b:${SIG_PATH}`]: signature } });
  const result = await checkAuthorization(facts, "b", SPEC, SLUG, [signer]);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /SSH signature envelope/);
});

test("[01ky80j7en0439-drop-the-v1-bare-signature-format#2] a bare base64 spec-lane companion is refused", async () => {
  const OPEN = "status: open\nevidence: exempt\noutcome: X.\nacceptance:\n- one\n";
  const facts = memoryFacts({
    files: {
      [`h:specs/${SLUG}.md`]: OPEN,
      [`h:${SIG_PATH}`]: "VGhpcyBpcyBiYXJlIGJhc2U2NA==",
    },
  });
  const result = await validateSpecLane(facts, "b", "h", [
    { path: `specs/${SLUG}.md`, kind: "added" },
    { path: SIG_PATH, kind: "added" },
  ]);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /SSH signature envelope/);
});
