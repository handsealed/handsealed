import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const CLI = fileURLToPath(new URL("../../verifier/dist/cli.js", import.meta.url));

const run = (args: string[], cwd?: string): { status: number; stdout: string; stderr: string } => {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...(cwd === undefined ? {} : { cwd }),
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? 1,
      stdout: String(failure.stdout ?? ""),
      stderr: String(failure.stderr ?? ""),
    };
  }
};

test("[01ky81768egpbj-align-the-vocabulary-spec-becomes-mandate#1] the engine exports the mandate vocabulary", async () => {
  const engine: Record<string, unknown> = await import("./index.js");
  assert.equal(typeof engine["parseMandate"], "function");
  assert.equal(typeof engine["printMandate"], "function");
  assert.equal(typeof engine["validateMandateLane"], "function");
  assert.ok(Array.isArray(engine["MANDATE_STATUSES"]));
});

test("[01ky81768egpbj-align-the-vocabulary-spec-becomes-mandate#2] the CLI mints with mandate new and the spec verb is gone", () => {
  const dir = mkdtempSync(join(tmpdir(), "handsealed-vocab-"));
  try {
    const minted = run(["mandate", "new", "prove", "the", "vocabulary", "--dir", dir]);
    assert.equal(minted.status, 0, minted.stderr);
    assert.match(minted.stdout, /prove-the-vocabulary\.md/);
    const legacy = run(["spec", "new", "nope", "--dir", dir]);
    assert.equal(legacy.status, 2);
    assert.match(legacy.stderr, /commands:/);
    assert.ok(!/^  spec /m.test(legacy.stderr), "usage must no longer advertise a spec verb");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[01ky81768egpbj-align-the-vocabulary-spec-becomes-mandate#3] verify without flags judges origin/main..HEAD", () => {
  const dir = mkdtempSync(join(tmpdir(), "handsealed-verify-"));
  try {
    execFileSync("git", ["init", "-qb", "main", dir]);
    const bare = run(["verify"], dir);
    assert.notEqual(bare.status, 0);
    assert.ok(
      !/requires --base and --head/.test(bare.stderr),
      "verify must default the range, not demand flags",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
