import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalCommitments, parseSpec } from "@handsealed/engine";
import { isOpensshPrivateKey, sshsigSignWithPem, sshsigSignWithSshKeygen } from "./sshsig-emit.js";

/** The raw 32-byte Ed25519 public key as base64 — the form `.handsealed.yml` allowedSigners expects. */
export function publicKeyBase64(key: KeyObject): string {
  const jwk = key.export({ format: "jwk" });
  if (jwk.kty !== "OKP" || typeof jwk.x !== "string") {
    throw new Error("not an Ed25519 key");
  }
  return Buffer.from(jwk.x, "base64url").toString("base64");
}

export interface SigningKeypair {
  /** PKCS8 PEM — the owner keeps this and never commits it. */
  readonly privateKeyPem: string;
  /** Base64 raw public key for `.handsealed.yml` allowedSigners. */
  readonly publicKey: string;
}

/** Mint an Ed25519 keypair: the public key for config, the private key for the owner. */
export function generateSigningKey(): SigningKeypair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: publicKeyBase64(publicKey),
  };
}

export interface SignOptions {
  readonly dir: string;
  readonly keyPath: string;
}

/**
 * Sign a mandate's commitments with a code owner's key and write the sibling
 * `<slug>.sig` the authorization rule verifies. Emits the v2 SSHSIG envelope:
 * a PKCS8 PEM key signs in-process; an OpenSSH key (including hardware `sk-`)
 * delegates to `ssh-keygen -Y sign`. Returns the signature path.
 */
export function specSign(rawSlug: string, options: SignOptions): string {
  const slug = rawSlug.replace(/\.md$/, "").replace(/^.*\//, "");
  const specPath = join(options.dir, `${slug}.md`);
  let source: string;
  try {
    source = readFileSync(specPath, "utf8");
  } catch {
    throw new Error(`mandate not found: ${specPath}`);
  }
  const parsed = parseSpec(source);
  if (!parsed.ok) {
    throw new Error(
      `cannot sign an invalid mandate: ${parsed.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  const commitments = canonicalCommitments(slug, parsed.value);
  const keyText = readFileSync(options.keyPath, "utf8");
  const envelope = isOpensshPrivateKey(keyText)
    ? sshsigSignWithSshKeygen(commitments, options.keyPath)
    : sshsigSignWithPem(commitments, keyText);
  const sigPath = join(options.dir, `${slug}.sig`);
  writeFileSync(sigPath, envelope.endsWith("\n") ? envelope : `${envelope}\n`);
  return sigPath;
}
