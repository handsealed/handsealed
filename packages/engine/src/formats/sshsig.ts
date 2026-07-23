/**
 * The OpenSSH signature envelope (PROTOCOL.sshsig) — the v2 container for
 * `specs/<slug>.sig`. One file may carry several concatenated PEM blocks
 * (future multi-approver); each embeds its own public key, so verification
 * is against the embedded key and authorization is that key's membership in
 * `allowedSigners`. Parsing is hand-rolled over the uint32-length-prefixed
 * wire format: one canonical implementation, fully fixtured against real
 * `ssh-keygen` output, no parser-differential surface. v1 scope is classic
 * `ssh-ed25519`; FIDO `sk-` types are named-and-refused until the follow-up.
 */

/** Every signature in the product signs under this SSHSIG namespace. */
export const SSHSIG_NAMESPACE = "handsealed";

export interface SshSignatureBlock {
  readonly publicKeyRaw: Uint8Array<ArrayBuffer>;
  readonly namespace: string;
  readonly hashAlgorithm: "sha256" | "sha512";
  readonly signatureRaw: Uint8Array<ArrayBuffer>;
}

export type SshSignatureParse =
  | { readonly ok: true; readonly blocks: readonly SshSignatureBlock[] }
  | { readonly ok: false; readonly issue: string };

const BEGIN = "-----BEGIN SSH SIGNATURE-----";
const END = "-----END SSH SIGNATURE-----";
const MAGIC = "SSHSIG";
const KEY_TYPE = "ssh-ed25519";

export function looksLikeSshSignature(text: string): boolean {
  return text.includes(BEGIN);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

/** A cursor over the wire bytes; every read returns null past the end. */
interface Cursor {
  bytes: Uint8Array<ArrayBuffer>;
  offset: number;
}

function take(cursor: Cursor, count: number): Uint8Array<ArrayBuffer> | null {
  if (cursor.offset + count > cursor.bytes.length) return null;
  const slice = cursor.bytes.slice(cursor.offset, cursor.offset + count);
  cursor.offset += count;
  return slice;
}

function uint32(cursor: Cursor): number | null {
  const raw = take(cursor, 4);
  if (raw === null) return null;
  return ((raw[0] ?? 0) << 24) | ((raw[1] ?? 0) << 16) | ((raw[2] ?? 0) << 8) | (raw[3] ?? 0);
}

/** An SSH wire `string`: uint32 length + bytes. */
function wireString(cursor: Cursor): Uint8Array<ArrayBuffer> | null {
  const length = uint32(cursor);
  if (length === null) return null;
  return take(cursor, length);
}

const utf8 = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

function parseBlock(base64Body: string): SshSignatureBlock | string {
  const bytes = fromBase64(base64Body);
  if (bytes === null) return "envelope is not valid base64";
  const cursor: Cursor = { bytes, offset: 0 };
  const magic = take(cursor, MAGIC.length);
  if (magic === null || utf8(magic) !== MAGIC) return "missing SSHSIG magic";
  const version = uint32(cursor);
  if (version !== 1) return `unsupported SSHSIG version ${String(version)}`;
  const publicKeyBlob = wireString(cursor);
  const namespaceBytes = wireString(cursor);
  const reserved = wireString(cursor);
  const hashAlgorithmBytes = wireString(cursor);
  const signatureBlob = wireString(cursor);
  if (
    publicKeyBlob === null ||
    namespaceBytes === null ||
    reserved === null ||
    hashAlgorithmBytes === null ||
    signatureBlob === null ||
    cursor.offset !== bytes.length
  ) {
    return "truncated or malformed SSHSIG envelope";
  }
  const publicKey: Cursor = { bytes: publicKeyBlob, offset: 0 };
  const keyType = wireString(publicKey);
  const keyMaterial = wireString(publicKey);
  if (keyType === null || keyMaterial === null) return "malformed public key blob";
  if (utf8(keyType) !== KEY_TYPE) {
    return `unsupported key type "${utf8(keyType)}" (sk- keys arrive with the follow-up)`;
  }
  if (keyMaterial.length !== 32) return "ed25519 public key must be 32 bytes";
  const signature: Cursor = { bytes: signatureBlob, offset: 0 };
  const signatureType = wireString(signature);
  const signatureRaw = wireString(signature);
  if (signatureType === null || signatureRaw === null) return "malformed signature blob";
  if (utf8(signatureType) !== KEY_TYPE) {
    return `unsupported signature type "${utf8(signatureType)}"`;
  }
  if (signatureRaw.length !== 64) return "ed25519 signature must be 64 bytes";
  const hashAlgorithm = utf8(hashAlgorithmBytes);
  if (hashAlgorithm !== "sha256" && hashAlgorithm !== "sha512") {
    return `unsupported hash algorithm "${hashAlgorithm}"`;
  }
  return {
    publicKeyRaw: keyMaterial,
    namespace: utf8(namespaceBytes),
    hashAlgorithm,
    signatureRaw,
  };
}

/** Parse every PEM block in the file; one bad block fails the whole file. */
export function parseSshSignatures(text: string): SshSignatureParse {
  const blocks: SshSignatureBlock[] = [];
  const pattern = new RegExp(`${BEGIN}\\r?\\n([\\s\\S]*?)${END}`, "g");
  for (const match of text.matchAll(pattern)) {
    const body = (match[1] ?? "").replace(/\s+/g, "");
    const block = parseBlock(body);
    if (typeof block === "string") return { ok: false, issue: block };
    blocks.push(block);
  }
  if (blocks.length === 0) return { ok: false, issue: "no SSH signature block found" };
  return { ok: true, blocks };
}

const encoder = new TextEncoder();

function encodeWireString(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + payload.length);
  out[0] = (payload.length >>> 24) & 0xff;
  out[1] = (payload.length >>> 16) & 0xff;
  out[2] = (payload.length >>> 8) & 0xff;
  out[3] = payload.length & 0xff;
  out.set(payload, 4);
  return out;
}

/**
 * The bytes an SSHSIG signature actually signs: the magic, the namespace,
 * a reserved empty string, the hash algorithm, and the message's digest —
 * so the same commitments verify identically under every SSHSIG verifier.
 */
export async function sshsigSignedData(
  namespace: string,
  hashAlgorithm: "sha256" | "sha512",
  message: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(hashAlgorithm === "sha512" ? "SHA-512" : "SHA-256", message),
  );
  const parts = [
    encoder.encode(MAGIC),
    encodeWireString(encoder.encode(namespace)),
    encodeWireString(new Uint8Array(0)),
    encodeWireString(encoder.encode(hashAlgorithm)),
    encodeWireString(digest),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** The raw 32 key bytes from an `ssh-ed25519 <base64> [comment]` public key line. */
export function rawKeyFromSshPublicKey(line: string): Uint8Array<ArrayBuffer> | null {
  const fields = line.trim().split(/\s+/);
  if (fields[0] !== KEY_TYPE || fields[1] === undefined) return null;
  const blob = fromBase64(fields[1]);
  if (blob === null) return null;
  const cursor: Cursor = { bytes: blob, offset: 0 };
  const keyType = wireString(cursor);
  const keyMaterial = wireString(cursor);
  if (keyType === null || utf8(keyType) !== KEY_TYPE) return null;
  if (keyMaterial === null || keyMaterial.length !== 32) return null;
  return keyMaterial;
}
