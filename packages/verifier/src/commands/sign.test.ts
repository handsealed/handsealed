import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkAuthorization, parseSpec } from "@handsealed/engine";
import { memoryFacts } from "@handsealed/facts/memory";
import {
  DEFAULT_KEY_PATH,
  commitAndPush,
  renderCommitments,
  resolveKeyPath,
  signAll,
  unsignedFrom,
} from "./sign.js";
import { generateSigningKey } from "./spec-sign.js";

const MANDATE = `status: delivered
evidence: additive
paths: src/**
outcome: A thing to sign.
acceptance:
- It happens.
`;

const scratch = (): string => mkdtempSync(join(tmpdir(), "handsealed-signverb-"));

test("[01ky65jxdkmk54-one-command-signing#1] discovery keeps only parseable unsigned mandates and renders their commitments", () => {
  const files: Record<string, string> = {
    "specs/01k0h3v8-signed.md": MANDATE,
    "specs/01k0h3v9-unsigned.md": MANDATE,
    "specs/garbage.md": "not: [a spec\n",
  };
  const mandates = unsignedFrom(
    ["specs/01k0h3v8-signed.md", "specs/01k0h3v9-unsigned.md", "specs/garbage.md", "specs/x.sig"],
    (path) => files[path] ?? null,
    (sigPath) => sigPath === "specs/01k0h3v8-signed.sig",
  );
  assert.deepEqual(
    mandates.map((mandate) => mandate.slug),
    ["01k0h3v9-unsigned"],
  );
  const rendered = renderCommitments(mandates[0]!);
  assert.match(rendered, /01k0h3v9-unsigned/);
  assert.match(rendered, /evidence: additive/);
  assert.match(rendered, /paths: src\/\*\*/);
  assert.match(rendered, /- It happens\./);
  assert.match(rendered, /never signed/);
});

test("[01ky65jxdkmk54-one-command-signing#2] the conventional key path is the default, and signAll writes signatures the authorization rule accepts", async () => {
  assert.equal(DEFAULT_KEY_PATH, join(homedir(), ".handsealed", "key.pem"));
  assert.equal(resolveKeyPath("/nonexistent/key.pem").ok, false);

  const dir = scratch();
  try {
    const specsDir = join(dir, "specs");
    mkdirSync(specsDir, { recursive: true });
    writeFileSync(join(specsDir, "01k0h3v9-unsigned.md"), MANDATE);
    const { privateKeyPem, publicKey } = generateSigningKey();
    const keyPath = join(dir, "key.pem");
    writeFileSync(keyPath, privateKeyPem);
    const resolved = resolveKeyPath(keyPath);
    assert.equal(resolved.ok, true);

    const parsed = parseSpec(MANDATE);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const mandates = [
      {
        slug: "01k0h3v9-unsigned",
        path: join(specsDir, "01k0h3v9-unsigned.md"),
        spec: parsed.value,
      },
    ];
    const sigPaths = signAll(mandates, { keyPath, dir: specsDir });
    assert.equal(sigPaths.length, 1);
    const signature = readFileSync(sigPaths[0]!, "utf8");
    const facts = memoryFacts({
      changes: [],
      files: { "h:specs/01k0h3v9-unsigned.sig": signature },
    });
    const verdict = await checkAuthorization(facts, "h", parsed.value, "01k0h3v9-unsigned", [
      { name: "owner", key: publicKey },
    ]);
    assert.equal(verdict.status, "pass");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[01ky65jxdkmk54-one-command-signing#3][01ky65tez70e3p-fix-the-sign-push-test-on-ci#1] commitAndPush lands the signature on the branch and its remote", () => {
  const dir = scratch();
  try {
    const remote = join(dir, "remote.git");
    execFileSync("git", ["init", "-q", "--bare", remote]);
    const repo = join(dir, "repo");
    execFileSync("git", ["clone", "-q", remote, repo]);
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", repo, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    git("config", "user.email", "t@t.dev");
    git("config", "user.name", "tester");
    // Pin the branch name: an empty-repo clone names its unborn branch from
    // the runner's init.defaultBranch, and `git push` under push.default
    // simple refuses when branch and upstream names differ.
    git("checkout", "-qb", "main");
    mkdirSync(join(repo, "specs"), { recursive: true });
    writeFileSync(join(repo, "specs", "01k0h3v9-unsigned.md"), MANDATE);
    git("add", "-A");
    git("commit", "-qm", "mandate");
    git("push", "-qu", "origin", "main");

    writeFileSync(join(repo, "specs", "01k0h3v9-unsigned.sig"), "aGVsbG8=\n");
    const cwd = process.cwd();
    process.chdir(repo);
    try {
      commitAndPush(["specs/01k0h3v9-unsigned.sig"], ["01k0h3v9-unsigned"], { push: true });
    } finally {
      process.chdir(cwd);
    }
    const remoteFiles = execFileSync(
      "git",
      ["-C", remote, "ls-tree", "-r", "--name-only", "main"],
      {
        encoding: "utf8",
      },
    );
    assert.match(remoteFiles, /specs\/01k0h3v9-unsigned\.sig/);
    const message = git("log", "-1", "--format=%s");
    assert.match(message, /chore: sign 01k0h3v9-unsigned/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
