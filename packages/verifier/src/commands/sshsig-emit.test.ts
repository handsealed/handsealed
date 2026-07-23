import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkAuthorization, parseSshSignatures } from "@handsealed/engine";
import { memoryFacts } from "@handsealed/facts/memory";
import { generateSigningKey } from "./mandate-sign.js";
import { isOpensshPrivateKey, sshsigSignWithPem, sshsigSignWithSshKeygen } from "./sshsig-emit.js";

// The engine's SSHSIG fixtures pin verification against real ssh-keygen
// output; these tests pin the other direction — our emitted envelopes must
// verify under the engine AND under `ssh-keygen -Y verify` itself.

const FIXTURE_KEY1_PRIVATE = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACCs+6QVSuvT9mw1FI+coalpoovSskJ7Kop2S3pUjwnJdAAAAJhG+y4lRvsu
JQAAAAtzc2gtZWQyNTUxOQAAACCs+6QVSuvT9mw1FI+coalpoovSskJ7Kop2S3pUjwnJdA
AAAED07UUrtHMAv9uNV6SMIBF0O+DqFy20oDxE67pOe2oS76z7pBVK69P2bDUUj5yhqWmi
i9KyQnsqinZLelSPCcl0AAAAEmhhbmRzZWFsZWQtZml4dHVyZQECAw==
-----END OPENSSH PRIVATE KEY-----
`;
const FIXTURE_PUB1 =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKz7pBVK69P2bDUUj5yhqWmii9KyQnsqinZLelSPCcl0 handsealed-fixture";

const MESSAGE = new TextEncoder().encode("some commitments to sign");

function sshKeygenAvailable(): boolean {
  try {
    execFileSync("ssh-keygen", ["-Y", "sign"], { stdio: "ignore" });
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

test("a PEM-signed envelope parses and carries the handsealed namespace", () => {
  const { privateKeyPem } = generateSigningKey();
  const envelope = sshsigSignWithPem(MESSAGE, privateKeyPem);
  const parsed = parseSshSignatures(envelope);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.issue);
  assert.equal(parsed.blocks[0]?.namespace, "handsealed");
  assert.ok(isOpensshPrivateKey(FIXTURE_KEY1_PRIVATE));
  assert.ok(!isOpensshPrivateKey(privateKeyPem));
});

test("a PEM-emitted envelope verifies under ssh-keygen -Y verify (interop)", (t) => {
  if (!sshKeygenAvailable()) {
    t.skip("ssh-keygen not available");
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "handsealed-interop-"));
  try {
    const { privateKeyPem, publicKey } = generateSigningKey();
    const envelope = sshsigSignWithPem(MESSAGE, privateKeyPem);
    const sigPath = join(dir, "message.sig");
    const messagePath = join(dir, "message");
    const signersPath = join(dir, "allowed_signers");
    writeFileSync(sigPath, envelope);
    writeFileSync(messagePath, Buffer.from(MESSAGE));
    const sshPublicKey = `ssh-ed25519 ${Buffer.concat([
      Buffer.from([0, 0, 0, 11]),
      Buffer.from("ssh-ed25519"),
      Buffer.from([0, 0, 0, 32]),
      Buffer.from(publicKey, "base64"),
    ]).toString("base64")}`;
    writeFileSync(signersPath, `owner ${sshPublicKey}\n`);
    const output = execFileSync(
      "ssh-keygen",
      ["-Y", "verify", "-f", signersPath, "-I", "owner", "-n", "handsealed", "-s", sigPath],
      { input: Buffer.from(MESSAGE), encoding: "utf8" },
    );
    assert.match(output, /Good "handsealed" signature/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an OpenSSH key delegates to ssh-keygen -Y sign and the engine authorizes it", async (t) => {
  if (!sshKeygenAvailable()) {
    t.skip("ssh-keygen not available");
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "handsealed-delegate-"));
  try {
    const keyPath = join(dir, "key");
    writeFileSync(keyPath, FIXTURE_KEY1_PRIVATE);
    chmodSync(keyPath, 0o600);
    const commitments = new TextEncoder().encode(
      "handsealed-authorization/v1\n" +
        "slug:01abcdefgh2345-fixture-mandate\n" +
        "evidence:additive\n" +
        "paths:packages/**\n" +
        "acceptance:Does the thing.",
    );
    const envelope = sshsigSignWithSshKeygen(commitments, keyPath);
    const facts = memoryFacts({
      changes: [],
      files: { "b:specs/01abcdefgh2345-fixture-mandate.sig": envelope },
    });
    const verdict = await checkAuthorization(
      facts,
      "b",
      {
        status: "delivered",
        evidence: "additive",
        paths: ["packages/**"],
        outcome: "Fixture.",
        acceptance: ["Does the thing."],
      },
      "01abcdefgh2345-fixture-mandate",
      [{ name: "zygimantas", key: FIXTURE_PUB1 }],
    );
    assert.equal(verdict.status, "pass");
    assert.match(verdict.findings[0]?.message ?? "", /authorized by zygimantas/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
