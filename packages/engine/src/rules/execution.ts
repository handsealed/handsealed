import { countsOf, type SuiteResults } from "../formats/results.js";
import type { Spec } from "../formats/spec.js";
import type { Finding, RuleVerdict } from "./verdict.js";
import { verdict } from "./verdict.js";

const TITLE = "Evidence execution";

/**
 * The runtime half of evidence: suite results attested at the judged head.
 * The static rules prove the diff's shape; this rule proves the claimed
 * tests actually ran. Fail-closed: zero failing cases across every attested
 * suite, and an additive mandate's acceptance bullets must each have been
 * EXECUTED — a passing case carrying the bullet's `[slug#n]` marker in its
 * case name. A marker in a comment proves nothing ran. The receipts are
 * reproducible, not trusted: anyone replays them with `handsealed evidence
 * run` and `verify --results`.
 */
export function checkExecution(
  spec: Spec,
  slug: string,
  results: readonly SuiteResults[],
): RuleVerdict {
  if (spec.evidence === "exempt") {
    return verdict("execution", TITLE, "info", [{ message: "exempt: no execution owed" }]);
  }
  if (results.length === 0) {
    return verdict("execution", TITLE, "fail", [
      { message: "no suite results attested — run the suites and pass their results" },
    ]);
  }
  const findings: Finding[] = [];
  for (const suite of results) {
    const counts = countsOf(suite);
    if (counts.fail > 0) {
      const failed = suite.cases
        .filter((testCase) => testCase.outcome === "fail")
        .map((testCase) => testCase.name);
      const shown = failed.slice(0, 3).join("; ");
      findings.push({
        message: `suite "${suite.suite}": ${counts.fail} failing case(s) — ${shown}${failed.length > 3 ? "; …" : ""}`,
      });
    }
  }
  if (spec.evidence === "additive") {
    const passing = results.flatMap((suite) =>
      suite.cases
        .filter((testCase) => testCase.outcome === "pass")
        .map((testCase) => testCase.name),
    );
    for (let bullet = 1; bullet <= spec.acceptance.length; bullet += 1) {
      const marker = `[${slug}#${bullet}]`;
      if (!passing.some((name) => name.includes(marker))) {
        findings.push({
          message: `acceptance bullet #${bullet} was not executed: no passing case carries ${marker} in its name`,
        });
      }
    }
  }
  if (findings.length > 0) {
    return verdict("execution", TITLE, "fail", findings);
  }
  const total = results.reduce((sum, suite) => sum + suite.cases.length, 0);
  const executed =
    spec.evidence === "additive" ? `, all ${spec.acceptance.length} bullet(s) executed` : "";
  return verdict("execution", TITLE, "pass", [
    { message: `${results.length} suite(s), ${total} case(s) executed, zero failures${executed}` },
  ]);
}
