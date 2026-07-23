#!/usr/bin/env node
/**
 * The Handsealed CLI. `verify` replays the offline judge — the exact
 * composition every other surface runs — against any clone.
 * Don't trust us; run it yourself.
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { judge, renderMarkdown } from "@handsealed/engine";
import { createGitFacts } from "@handsealed/facts-git";
import { evidenceRun, renderEvidenceSummary } from "./commands/evidence.js";
import { buildNodeTestArgs } from "./commands/results.js";
import { specNew } from "./commands/spec-new.js";
import {
  changedSpecPaths,
  commitAndPush,
  renderCommitments,
  resolveKeyPath,
  signAll,
  unsignedFrom,
} from "./commands/sign.js";
import { generateSigningKey, specSign } from "./commands/spec-sign.js";

const USAGE = `handsealed <command>

commands:
  verify --base <rev> --head <rev> [--approved <rev>] [--repo <dir>] [--json]
      Replay the offline judge over base..head. Exit 0 pass, 1 fail.
      With --approved, the re-approval fact states what moved since that head.
  spec new <words...> [--dir specs]
      Mint an open mandate with a sortable, collision-proof filename.
  spec sign <slug> --key <file> [--dir specs]
      Sign a mandate's commitments with a code owner's Ed25519 private key,
      writing specs/<slug>.sig for the authorization rule to verify.
  keygen [--out <file>]
      Mint an Ed25519 signing keypair: the PKCS8 private key to <file>, the
      base64 public key (for .handsealed.yml allowedSigners) to stdout.
  sign [<slug>...] [--key <file>] [--dir specs] [--base origin/main]
       [--commit] [--push] [--yes]
      Discover the branch's unsigned mandates (or take explicit slugs), show
      the commitments you are about to sign, confirm, and sign with your
      code-owner key (default ~/.handsealed/key.pem), writing sibling .sig
      files; --commit/--push land them on the branch.
  results emit-node [--suite <name>] [--out <file>] [--] [paths...]
      Run node:test with the handsealed reporter attached.
  evidence run [--dir <cwd>]
      Run every configured suite and collect result files. Red tests are
      evidence, not errors; missing evidence fails closed.
`;

async function runVerify(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      base: { type: "string" },
      head: { type: "string" },
      approved: { type: "string" },
      repo: { type: "string", default: "." },
      json: { type: "boolean", default: false },
    },
  });
  if (values.base === undefined || values.head === undefined) {
    process.stderr.write("verify requires --base and --head\n");
    return 2;
  }
  const facts = createGitFacts(values.repo ?? ".");
  const verdicts = await judge(
    facts,
    values.base,
    values.head,
    values.approved === undefined ? {} : { approved: values.approved },
  );
  process.stdout.write(
    values.json === true ? `${JSON.stringify(verdicts)}\n` : renderMarkdown(verdicts),
  );
  return verdicts.overall === "pass" ? 0 : 1;
}

function runSpec(argv: string[]): number {
  const [sub, ...rest] = argv;
  if (sub === "new") {
    const { values, positionals } = parseArgs({
      args: rest,
      options: { dir: { type: "string", default: "specs" } },
      allowPositionals: true,
    });
    const path = specNew(positionals, { dir: values.dir ?? "specs" });
    process.stdout.write(`${path}\n`);
    return 0;
  }
  if (sub === "sign") {
    const { values, positionals } = parseArgs({
      args: rest,
      options: { dir: { type: "string", default: "specs" }, key: { type: "string" } },
      allowPositionals: true,
    });
    const slug = positionals[0];
    if (slug === undefined || values.key === undefined) {
      process.stderr.write("spec sign requires <slug> and --key <file>\n");
      return 2;
    }
    const path = specSign(slug, { dir: values.dir ?? "specs", keyPath: values.key });
    process.stdout.write(`${path}\n`);
    return 0;
  }
  process.stderr.write(USAGE);
  return 2;
}

async function runSign(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      key: { type: "string" },
      dir: { type: "string", default: "specs" },
      base: { type: "string", default: "origin/main" },
      commit: { type: "boolean", default: false },
      push: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  const dir = values.dir ?? "specs";
  const key = resolveKeyPath(values.key);
  if (!key.ok) {
    process.stderr.write(`${key.error}\n`);
    return 2;
  }
  const candidates =
    positionals.length > 0
      ? positionals.map((slug) => `${dir}/${String(slug).replace(/\.md$/, "")}.md`)
      : changedSpecPaths({ base: values.base ?? "origin/main", dir });
  const { readFileSync, existsSync } = await import("node:fs");
  const mandates = unsignedFrom(
    candidates,
    (path) => (existsSync(path) ? readFileSync(path, "utf8") : null),
    (sigPath) => existsSync(sigPath),
  );
  if (mandates.length === 0) {
    process.stdout.write("nothing to sign: no unsigned mandates found\n");
    return 0;
  }
  for (const mandate of mandates) {
    process.stderr.write(`${renderCommitments(mandate)}\n\n`);
  }
  if (values.yes !== true) {
    if (!process.stdin.isTTY) {
      process.stderr.write("not a terminal — confirm signing with --yes\n");
      return 2;
    }
    const { createInterface } = await import("node:readline/promises");
    const prompt = createInterface({ input: process.stdin, output: process.stderr });
    const answer = (await prompt.question(`Sign ${mandates.length} mandate(s)? [y/N] `)).trim();
    prompt.close();
    if (answer.toLowerCase() !== "y") {
      process.stderr.write("aborted — nothing signed\n");
      return 2;
    }
  }
  const sigPaths = signAll(mandates, { keyPath: key.path, dir });
  for (const path of sigPaths) {
    process.stdout.write(`${path}\n`);
  }
  if (values.commit === true || values.push === true) {
    commitAndPush(
      sigPaths,
      mandates.map((mandate) => mandate.slug),
      { push: values.push === true },
    );
  }
  return 0;
}

function runKeygen(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: { out: { type: "string", default: "handsealed-signing-key.pem" } },
  });
  const outPath = values.out ?? "handsealed-signing-key.pem";
  const { privateKeyPem, publicKey } = generateSigningKey();
  writeFileSync(outPath, privateKeyPem, { flag: "wx" });
  process.stderr.write(`wrote the private key to ${outPath} — keep it secret, never commit it\n`);
  process.stdout.write(`${publicKey}\n`);
  return 0;
}

async function runResults(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  if (sub !== "emit-node") {
    process.stderr.write(USAGE);
    return 2;
  }
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      suite: { type: "string", default: "default" },
      out: { type: "string", default: "handsealed-results.json" },
    },
    allowPositionals: true,
  });
  const args = buildNodeTestArgs({
    suite: values.suite ?? "default",
    out: values.out ?? "handsealed-results.json",
    paths: positionals,
  });
  return await new Promise<number>((resolve) => {
    const child = spawn(process.execPath, args, {
      stdio: "inherit",
      env: { ...process.env, HANDSEALED_SUITE: values.suite ?? "default" },
    });
    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

async function runEvidence(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  if (sub !== "run") {
    process.stderr.write(USAGE);
    return 2;
  }
  const { values } = parseArgs({ args: rest, options: { dir: { type: "string", default: "." } } });
  const outcome = await evidenceRun(values.dir ?? ".");
  process.stdout.write(renderEvidenceSummary(outcome));
  return outcome.ok ? 0 : 1;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  try {
    if (command === "verify") return await runVerify(rest);
    if (command === "spec") return runSpec(rest);
    if (command === "sign") return await runSign(rest);
    if (command === "keygen") return runKeygen(rest);
    if (command === "results") return await runResults(rest);
    if (command === "evidence") return await runEvidence(rest);
  } catch (error) {
    process.stderr.write(`handsealed: ${(error as Error).message}\n`);
    return 2;
  }
  process.stderr.write(USAGE);
  return 2;
}

process.exitCode = await main();
