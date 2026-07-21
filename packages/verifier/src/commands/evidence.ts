/**
 * `handsealed evidence run` — the muscle side of the assay, run on the
 * customer's own CI: read `.handsealed.yml`, run every suite with
 * HANDSEALED_SUITE set, then validate and collect the result files.
 *
 * Failing tests are evidence, not errors: suite exit codes never fail the
 * run. What fails it — fail-closed — is a missing or unparseable results
 * file, because then there is no evidence at all.
 */
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_PATH, parseConfig, parseResults } from "@handsealed/engine";

export interface SuiteRun {
  suite: string;
  exitCode: number;
  resultsPath: string;
  /** Case count when the results file parsed; null when missing/invalid. */
  cases: number | null;
  problem?: string;
}

export interface EvidenceRunOutcome {
  runs: SuiteRun[];
  /** True when every suite produced a valid results file. */
  ok: boolean;
}

const runShell = (command: string, cwd: string, suite: string): Promise<number> =>
  new Promise((resolve, reject) => {
    const child = spawn("sh", ["-c", command], {
      cwd,
      stdio: "inherit",
      env: { ...process.env, HANDSEALED_SUITE: suite },
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });

export async function evidenceRun(
  cwd: string,
  collectDir = ".handsealed/results",
): Promise<EvidenceRunOutcome> {
  let rawConfig: string;
  try {
    rawConfig = readFileSync(join(cwd, CONFIG_PATH), "utf8");
  } catch {
    throw new Error(`no ${CONFIG_PATH} in ${cwd}`);
  }
  const config = parseConfig(rawConfig);
  if (!config.ok) {
    const first = config.issues[0];
    throw new Error(
      `${CONFIG_PATH} invalid: ${first?.message ?? "unknown"} (line ${first?.line ?? 1})`,
    );
  }
  mkdirSync(join(cwd, collectDir), { recursive: true });

  const runs: SuiteRun[] = [];
  for (const [suite, suiteConfig] of Object.entries(config.value.suites)) {
    const exitCode = await runShell(suiteConfig.run, cwd, suite);
    const resultsPath = suiteConfig.results;
    let cases: number | null = null;
    let problem: string | undefined;
    try {
      const parsed = parseResults(readFileSync(join(cwd, resultsPath), "utf8"));
      if (parsed.ok) {
        cases = parsed.value.cases.length;
        copyFileSync(join(cwd, resultsPath), join(cwd, collectDir, `${suite}.json`));
      } else {
        problem = `results file invalid: ${parsed.issues[0]?.message ?? "unknown"}`;
      }
    } catch {
      problem = "results file missing";
    }
    const run: SuiteRun = { suite, exitCode, resultsPath, cases };
    if (problem !== undefined) run.problem = problem;
    runs.push(run);
  }
  return { runs, ok: runs.every((run) => run.cases !== null) };
}

export function renderEvidenceSummary(outcome: EvidenceRunOutcome): string {
  const lines = outcome.runs.map((run) =>
    run.cases === null
      ? `suite ${run.suite}: exit ${run.exitCode} — ${run.problem ?? "no evidence"}`
      : `suite ${run.suite}: exit ${run.exitCode}, ${run.cases} case(s) → ${run.resultsPath}`,
  );
  lines.push(outcome.ok ? "evidence collected" : "evidence incomplete — failing closed");
  return `${lines.join("\n")}\n`;
}
