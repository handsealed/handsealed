import type { Facts, Oid } from "@handsealed/facts";
import type { AllowedSigner } from "../formats/config.js";
import type { Spec } from "../formats/spec.js";
import { SPECS_DIR } from "./lane.js";
import type { RuleVerdict } from "./verdict.js";
import { verdict } from "./verdict.js";

const TITLE = "Authorization";

/**
 * The bytes a code owner signs to authorize a mandate: its commitments — slug,
 * evidence class, scope, and acceptance — but never its status. Signing the
 * deal rather than the file means one authorization survives the open→delivered
 * flip yet still rejects any later tampering with what was promised. The signer
 * (the `spec sign` CLI) and every verifier recompute this identically.
 */
export function canonicalCommitments(slug: string, spec: Spec): Uint8Array<ArrayBuffer> {
  const lines = [
    "handsealed-authorization/v1",
    `slug:${slug}`,
    `evidence:${spec.evidence}`,
    `paths:${(spec.paths ?? []).join(",")}`,
    ...spec.acceptance.map((bullet) => `acceptance:${bullet}`),
  ];
  return new Uint8Array(new TextEncoder().encode(lines.join("\n")));
}

/** Base64 → bytes without Node's Buffer, so the engine stays Worker-loadable. */
function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.trim());
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function verifiesUnder(
  publicKeyRaw: Uint8Array<ArrayBuffer>,
  message: Uint8Array<ArrayBuffer>,
  signature: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("raw", publicKeyRaw, { name: "Ed25519" }, false, [
      "verify",
    ]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, signature, message);
  } catch {
    return false;
  }
}

/**
 * A mandate is authorized only by a code owner's Ed25519 signature over its
 * commitments, carried in a sibling `specs/<slug>.sig` read at the caller's
 * `ref` — base for a flip (the authorization precedes the work), head for a
 * one-shot (the signature itself is the authorization; forging it requires
 * the owner's key either way). Signers come from the base config; with none
 * configured the rule states so and does not gate, so flip adoption is
 * opt-in (the judge makes one-shots fail closed instead).
 */
export async function checkAuthorization(
  facts: Facts,
  ref: Oid,
  spec: Spec,
  slug: string,
  allowedSigners: readonly AllowedSigner[],
): Promise<RuleVerdict> {
  if (allowedSigners.length === 0) {
    return verdict("authorization", TITLE, "info", [
      { message: "no allowedSigners configured — authorization is not enforced" },
    ]);
  }
  const sigPath = `${SPECS_DIR}${slug}.sig`;
  const raw = await facts.fileAtRef(ref, sigPath);
  if (raw === null) {
    return verdict("authorization", TITLE, "fail", [
      { message: "unauthorized: no code-owner signature for the mandate", path: sigPath },
    ]);
  }
  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = fromBase64(raw);
  } catch {
    return verdict("authorization", TITLE, "fail", [
      { message: "unauthorized: signature is not valid base64", path: sigPath },
    ]);
  }
  const message = canonicalCommitments(slug, spec);
  for (const signer of allowedSigners) {
    let publicKey: Uint8Array<ArrayBuffer>;
    try {
      publicKey = fromBase64(signer.key);
    } catch {
      continue;
    }
    if (await verifiesUnder(publicKey, message, signature)) {
      return verdict("authorization", TITLE, "pass", [
        { message: `authorized by ${signer.name}`, path: sigPath },
      ]);
    }
  }
  return verdict("authorization", TITLE, "fail", [
    {
      message: "unauthorized: no allowed signer's signature covers the mandate's commitments",
      path: sigPath,
    },
  ]);
}
