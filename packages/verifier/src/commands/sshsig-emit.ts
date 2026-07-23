/**
 * SSHSIG envelope emission — the signer half of the v2 signature container.
 * Two paths to the same envelope: a PKCS8 PEM key signs in-process
 * (node:crypto), while an OpenSSH key file delegates to
 * `ssh-keygen -Y sign` so agent-resident and hardware (`sk-`) keys work
 * without this process ever touching key material. Verification lives in the
 * engine; interop is pinned by round-trip tests against real ssh-keygen.
 */

import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey, createPublicKey, sign as nodeSign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SSHSIG_NAMESPACE } from "@handsealed/engine";

const KEY_TYPE = "ssh-ed25519";

const u32 = (value: number): Buffer => {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
};

const wireString = (payload: Buffer): Buffer => Buffer.concat([u32(payload.length), payload]);

const armor = (blob: Buffer): string => {
  const base64 = blob.toString("base64");
  const lines = base64.match(/.{1,70}/g) ?? [];
  return `-----BEGIN SSH SIGNATURE-----\n${lines.join("\n")}\n-----END SSH SIGNATURE-----\n`;
};

/** The SSHSIG signed payload: magic, namespace, reserved, hash alg, digest. */
const signedData = (message: Uint8Array): Buffer =>
  Buffer.concat([
    Buffer.from("SSHSIG"),
    wireString(Buffer.from(SSHSIG_NAMESPACE)),
    wireString(Buffer.alloc(0)),
    wireString(Buffer.from("sha512")),
    wireString(createHash("sha512").update(message).digest()),
  ]);

export function isOpensshPrivateKey(keyText: string): boolean {
  return keyText.includes("BEGIN OPENSSH PRIVATE KEY");
}

/** Sign with a PKCS8 PEM Ed25519 key in-process and assemble the envelope. */
export function sshsigSignWithPem(message: Uint8Array, privateKeyPem: string): string {
  const privateKey = createPrivateKey(privateKeyPem);
  const jwk = createPublicKey(privateKey).export({ format: "jwk" });
  if (jwk.kty !== "OKP" || typeof jwk.x !== "string") {
    throw new Error("not an Ed25519 key");
  }
  const publicKeyRaw = Buffer.from(jwk.x, "base64url");
  const signature = nodeSign(null, signedData(message), privateKey);
  const publicKeyBlob = wireString(
    Buffer.concat([wireString(Buffer.from(KEY_TYPE)), wireString(publicKeyRaw)]),
  );
  const signatureBlob = wireString(
    Buffer.concat([wireString(Buffer.from(KEY_TYPE)), wireString(signature)]),
  );
  const blob = Buffer.concat([
    Buffer.from("SSHSIG"),
    u32(1),
    publicKeyBlob,
    wireString(Buffer.from(SSHSIG_NAMESPACE)),
    wireString(Buffer.alloc(0)),
    wireString(Buffer.from("sha512")),
    signatureBlob,
  ]);
  return armor(blob);
}

/**
 * Delegate to `ssh-keygen -Y sign` for OpenSSH keys — including hardware
 * `sk-` keys, where the touch happens at the owner's terminal, never here.
 */
export function sshsigSignWithSshKeygen(message: Uint8Array, keyPath: string): string {
  const dir = mkdtempSync(join(tmpdir(), "handsealed-sshsig-"));
  try {
    const messagePath = join(dir, "commitments");
    writeFileSync(messagePath, Buffer.from(message));
    execFileSync("ssh-keygen", ["-Y", "sign", "-n", SSHSIG_NAMESPACE, "-f", keyPath, messagePath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return readFileSync(`${messagePath}.sig`, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
