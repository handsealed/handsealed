import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  FIXTURE_COMMITMENTS,
  FIXTURE_PUB1,
  FIXTURE_SIG_GOOD,
  FIXTURE_SIG_STRANGER,
} from "./sshsig.fixtures.js";
import {
  looksLikeSshSignature,
  parseSshSignatures,
  rawKeyFromSshPublicKey,
  sshsigSignedData,
} from "./sshsig.js";

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

test("a real ssh-keygen envelope parses into its fields", () => {
  const parsed = parseSshSignatures(FIXTURE_SIG_GOOD);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.issue);
  assert.equal(parsed.blocks.length, 1);
  const block = parsed.blocks[0];
  assert.ok(block !== undefined);
  assert.equal(block.namespace, "handsealed");
  assert.equal(block.hashAlgorithm, "sha512");
  assert.equal(block.publicKeyRaw.length, 32);
  assert.equal(block.signatureRaw.length, 64);
  const expectedKey = rawKeyFromSshPublicKey(FIXTURE_PUB1);
  assert.ok(expectedKey !== null);
  assert.ok(sameBytes(block.publicKeyRaw, expectedKey));
});

test("several concatenated PEM blocks all parse (the multi-approver container)", () => {
  const parsed = parseSshSignatures(`${FIXTURE_SIG_GOOD}${FIXTURE_SIG_STRANGER}`);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.issue);
  assert.equal(parsed.blocks.length, 2);
  assert.equal(parsed.blocks[0]?.namespace, "handsealed");
  assert.equal(parsed.blocks[1]?.namespace, "handsealed");
});

test("garbage, bad base64, and missing blocks are refused with one clear issue", () => {
  const none = parseSshSignatures("just some text");
  assert.ok(!none.ok);
  assert.match(none.issue, /no SSH signature block/);
  const garbage = parseSshSignatures(
    "-----BEGIN SSH SIGNATURE-----\nnot*base64!\n-----END SSH SIGNATURE-----\n",
  );
  assert.ok(!garbage.ok);
  const wrongMagic = parseSshSignatures(
    `-----BEGIN SSH SIGNATURE-----\n${btoa("NOTSIGxxxxxxxxxxxxxxxx")}\n-----END SSH SIGNATURE-----\n`,
  );
  assert.ok(!wrongMagic.ok);
  assert.match(wrongMagic.issue, /magic/);
});

test("a truncated envelope is refused, never mis-read", () => {
  const body = FIXTURE_SIG_GOOD.split("\n").slice(1, -2).join("").slice(0, 40);
  const truncated = parseSshSignatures(
    `-----BEGIN SSH SIGNATURE-----\n${body}\n-----END SSH SIGNATURE-----\n`,
  );
  assert.ok(!truncated.ok);
});

test("looksLikeSshSignature separates envelopes from bare v1 base64", () => {
  assert.ok(looksLikeSshSignature(FIXTURE_SIG_GOOD));
  assert.ok(!looksLikeSshSignature("VGhpcyBpcyBiYXJlIGJhc2U2NA=="));
});

test("rawKeyFromSshPublicKey reads the key line with or without a comment", () => {
  const withComment = rawKeyFromSshPublicKey(FIXTURE_PUB1);
  const withoutComment = rawKeyFromSshPublicKey(FIXTURE_PUB1.split(" ").slice(0, 2).join(" "));
  assert.ok(withComment !== null && withoutComment !== null);
  assert.ok(sameBytes(withComment, withoutComment));
  assert.equal(rawKeyFromSshPublicKey("ssh-rsa AAAA..."), null);
  assert.equal(rawKeyFromSshPublicKey("ssh-ed25519 not*base64"), null);
});

test("the signed-data encoding verifies a real ssh-keygen signature under WebCrypto", async () => {
  const parsed = parseSshSignatures(FIXTURE_SIG_GOOD);
  assert.ok(parsed.ok);
  const block = parsed.blocks[0];
  assert.ok(block !== undefined);
  const message = new Uint8Array(new TextEncoder().encode(FIXTURE_COMMITMENTS));
  const signedData = await sshsigSignedData(block.namespace, block.hashAlgorithm, message);
  const key = await crypto.subtle.importKey("raw", block.publicKeyRaw, { name: "Ed25519" }, false, [
    "verify",
  ]);
  assert.ok(await crypto.subtle.verify({ name: "Ed25519" }, key, block.signatureRaw, signedData));
  const tampered = new Uint8Array(new TextEncoder().encode(`${FIXTURE_COMMITMENTS}x`));
  const tamperedData = await sshsigSignedData(block.namespace, block.hashAlgorithm, tampered);
  assert.ok(
    !(await crypto.subtle.verify({ name: "Ed25519" }, key, block.signatureRaw, tamperedData)),
  );
});
