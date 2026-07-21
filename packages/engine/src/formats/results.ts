import { SUITE_NAME_RE } from "./config.js";
import type { Issue, ParseResult } from "./issues.js";
import { fail, issue, ok } from "./issues.js";

/**
 * The `handsealed-results.json` contract: one file per suite run, cases as
 * the single source of truth — counts are always derived, never stored,
 * so the file cannot disagree with itself.
 *
 * (JSON issues carry line 1: positional fidelity matters for hand-written
 * formats; result files are machine-written.)
 */

export type CaseOutcome = "pass" | "fail" | "skip";

export interface TestCase {
  name: string;
  outcome: CaseOutcome;
}

export interface SuiteResults {
  version: 1;
  suite: string;
  cases: TestCase[];
}

const OUTCOMES: ReadonlySet<string> = new Set(["pass", "fail", "skip"]);
const TOP_KEYS = new Set(["version", "suite", "cases"]);
const CASE_KEYS = new Set(["name", "outcome"]);

export function parseResults(source: string): ParseResult<SuiteResults> {
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch (error) {
    return fail([issue(`invalid JSON: ${(error as Error).message}`, 1)]);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return fail([issue("results must be a JSON object", 1)]);
  }
  const issues: Issue[] = [];
  const push = (message: string): void => {
    issues.push(issue(message, 1));
  };
  const record = data as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!TOP_KEYS.has(key)) push(`unknown key "${key}"`);
  }
  if (record["version"] !== 1) push('"version" must be 1');
  const suite = record["suite"];
  if (typeof suite !== "string" || !SUITE_NAME_RE.test(suite)) {
    push('"suite" must match [a-z0-9][a-z0-9-]*');
  }
  const cases: TestCase[] = [];
  const rawCases = record["cases"];
  if (!Array.isArray(rawCases)) {
    push('"cases" must be an array');
  } else {
    rawCases.forEach((raw, index) => {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        push(`cases[${index}] must be an object`);
        return;
      }
      const entry = raw as Record<string, unknown>;
      for (const key of Object.keys(entry)) {
        if (!CASE_KEYS.has(key)) push(`cases[${index}] has unknown key "${key}"`);
      }
      const name = entry["name"];
      const outcome = entry["outcome"];
      if (typeof name !== "string" || name.trim() === "") {
        push(`cases[${index}].name must be a non-empty string`);
        return;
      }
      if (typeof outcome !== "string" || !OUTCOMES.has(outcome)) {
        push(`cases[${index}].outcome must be pass | fail | skip`);
        return;
      }
      cases.push({ name, outcome: outcome as CaseOutcome });
    });
  }
  if (issues.length > 0) return fail(issues);
  return ok({ version: 1, suite: suite as string, cases });
}

export function countsOf(results: SuiteResults): {
  total: number;
  pass: number;
  fail: number;
  skip: number;
} {
  let pass = 0;
  let failed = 0;
  let skip = 0;
  for (const testCase of results.cases) {
    if (testCase.outcome === "pass") pass += 1;
    else if (testCase.outcome === "fail") failed += 1;
    else skip += 1;
  }
  return { total: results.cases.length, pass, fail: failed, skip };
}

export function caseNames(results: SuiteResults): string[] {
  return results.cases.map((c) => c.name);
}

/**
 * Per-suite totals for the cardinality guard. Duplicate suite names are a
 * configuration error and throw (fail-closed), never a silent merge.
 */
export function cardinalityOf(results: readonly SuiteResults[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const suiteResults of results) {
    if (out[suiteResults.suite] !== undefined) {
      throw new Error(`duplicate suite "${suiteResults.suite}" in results`);
    }
    out[suiteResults.suite] = suiteResults.cases.length;
  }
  return out;
}
