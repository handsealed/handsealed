#!/usr/bin/env node
/**
 * The Handsealed CLI. `verify` replays the offline judge — the exact
 * composition every other surface runs — against any clone.
 * Don't trust us; run it yourself.
 */
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { judge, renderMarkdown } from "@handsealed/engine";
import { createGitFacts } from "@handsealed/facts-git";
import { evidenceRun, renderEvidenceSummary } from "./commands/evidence.js";
import { buildNodeTestArgs } from "./commands/results.js";
import { specNew } from "./commands/spec-new.js";

const USAGE = `handsealed <command>

commands:
  verify --base <rev> --head <rev> [--repo <dir>] [--json]
      Replay the offline judge over base..head. Exit 0 pass, 1 fail.
  spec new <words...> [--dir specs]
      Mint an open mandate with a sortable, collision-proof filename.
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
      repo: { type: "string", default: "." },
      json: { type: "boolean", default: false },
    },
  });
  if (values.base === undefined || values.head === undefined) {
    process.stderr.write("verify requires --base and --head\n");
    return 2;
  }
  const facts = createGitFacts(values.repo ?? ".");
  const verdicts = await judge(facts, values.base, values.head);
  process.stdout.write(
    values.json === true ? `${JSON.stringify(verdicts)}\n` : renderMarkdown(verdicts),
  );
  return verdicts.overall === "pass" ? 0 : 1;
}

function runSpec(argv: string[]): number {
  const [sub, ...rest] = argv;
  if (sub !== "new") {
    process.stderr.write(USAGE);
    return 2;
  }
  const { values, positionals } = parseArgs({
    args: rest,
    options: { dir: { type: "string", default: "specs" } },
    allowPositionals: true,
  });
  const path = specNew(positionals, { dir: values.dir ?? "specs" });
  process.stdout.write(`${path}\n`);
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
