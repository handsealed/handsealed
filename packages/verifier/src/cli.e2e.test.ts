import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { judge } from "@handsealed/engine";
import { createGitFacts } from "@handsealed/facts-git";
import { createRepo } from "@handsealed/facts-git/testing";

const CLI = fileURLToPath(new URL("./cli.js", import.meta.url));

const OPEN = `status: open\nevidence: additive\npaths: src/**\noutcome: Do the thing.\nacceptance:\n- It works.\n`;
const DELIVERED = OPEN.replace("status: open", "status: delivered");
const CONFIG = `version: 1\nsuites:\n  scripts:\n    run: npm test\n    results: r.json\ntestRoots:\n  - test\n`;
const FLIP = "specs/01k0h3v8-do-thing.md";

const runCli = (args: string[]): Promise<{ code: number; stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => {
      stdout += d;
    });
    child.stderr.on("data", (d: string) => {
      stderr += d;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });

test("the CLI reproduces the library judge bit-identically, pass and fail", async () => {
  const repo = createRepo();
  try {
    const base = repo.commit({
      message: "chore: base",
      files: { ".handsealed.yml": CONFIG, [FLIP]: OPEN, "src/a.ts": "export const a = 1;\n" },
    });
    const goodHead = repo.commit({
      message: "feat: deliver the mandate",
      files: {
        [FLIP]: DELIVERED,
        "src/a.ts": "export const a = 2;\n",
        "test/a.test.ts": "// [01k0h3v8-do-thing#1]\n",
      },
    });

    repo.branch("breach", base);
    repo.checkout("breach");
    const breachHead = repo.commit({
      message: "feat: overreach",
      files: {
        [FLIP]: DELIVERED,
        "src/a.ts": "export const a = 3;\n",
        "outside/b.ts": "export const b = 1;\n",
        "test/a.test.ts": "// [01k0h3v8-do-thing#1]\n",
      },
    });

    const facts = createGitFacts(repo.dir);

    const goodLibrary = await judge(facts, base, goodHead);
    const good = await runCli([
      "verify",
      "--repo",
      repo.dir,
      "--base",
      base,
      "--head",
      goodHead,
      "--json",
    ]);
    assert.equal(good.code, 0, good.stderr);
    assert.equal(good.stdout.trim(), JSON.stringify(goodLibrary));
    assert.equal(goodLibrary.overall, "pass");

    const breachLibrary = await judge(facts, base, breachHead);
    const breach = await runCli([
      "verify",
      "--repo",
      repo.dir,
      "--base",
      base,
      "--head",
      breachHead,
      "--json",
    ]);
    assert.equal(breach.code, 1);
    assert.equal(breach.stdout.trim(), JSON.stringify(breachLibrary));
    assert.equal(breachLibrary.overall, "fail");
    assert.equal(
      breachLibrary.rules.some(
        (r) => r.rule === "ceiling" && r.findings.some((f) => f.path === "outside/b.ts"),
      ),
      true,
    );
  } finally {
    repo.dispose();
  }
});

test("[01ky2zt4z52xsr-polish-the-delivery-surface#1] verify --approved appends the re-approval fact", async () => {
  const repo = createRepo();
  try {
    const base = repo.commit({
      message: "chore: base",
      files: { ".handsealed.yml": CONFIG, [FLIP]: OPEN },
    });
    const approved = repo.commit({
      message: "feat: first cut",
      files: { [FLIP]: DELIVERED, "test/a.test.ts": "// [01k0h3v8-do-thing#1]\n" },
    });
    const head = repo.commit({
      message: "fix: address review",
      files: { "src/late.ts": "export const late = 1;\n" },
    });
    const facts = createGitFacts(repo.dir);
    const library = await judge(facts, base, head, { approved });
    const cli = await runCli([
      "verify",
      "--repo",
      repo.dir,
      "--base",
      base,
      "--head",
      head,
      "--approved",
      approved,
      "--json",
    ]);
    assert.equal(cli.code, 0, cli.stderr);
    assert.equal(cli.stdout.trim(), JSON.stringify(library));
    const reapproval = library.rules.find((r) => r.rule === "reapproval");
    assert.equal(reapproval?.status, "attention");
    assert.equal(
      reapproval?.findings.some(
        (f) => f.path === "src/late.ts" && f.message === "new since approval",
      ),
      true,
    );
  } finally {
    repo.dispose();
  }
});

test("the markdown mode renders the verdict and usage errors exit 2", async () => {
  const repo = createRepo();
  try {
    const base = repo.commit({ message: "chore: base", files: { [FLIP]: OPEN } });
    const head = repo.commit({ message: "feat: flip", files: { [FLIP]: DELIVERED } });
    const result = await runCli(["verify", "--repo", repo.dir, "--base", base, "--head", head]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /## Handsealed verdict: ✓ PASS/);
    const usage = await runCli(["verify"]);
    assert.equal(usage.code, 2);
    const unknown = await runCli(["frobnicate"]);
    assert.equal(unknown.code, 2);
  } finally {
    repo.dispose();
  }
});
