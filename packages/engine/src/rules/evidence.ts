import type { PathChange } from "../facts.js";
import type { Spec } from "../formats/spec.js";
import { matchesAny } from "./glob.js";
import type { Finding, RuleVerdict } from "./verdict.js";
import { verdict } from "./verdict.js";

const TITLE = "Evidence class";

/**
 * Static consistency between the mandate's declared evidence class and the
 * diff's shape. (The evidence *execution* — red at base, green at head,
 * red-build labeling — happens in the evidence job; this rule only checks
 * that the declaration is coherent.)
 *
 * v1 decision, deliberate: `exempt` means flip-only — any product or test
 * change under an exempt mandate fails.
 */
export function checkEvidenceConsistency(
  spec: Spec,
  changes: PathChange[],
  flipPath: string,
  testRoots: readonly string[],
): RuleVerdict {
  const rest = changes.filter((c) => c.path !== flipPath);
  const testChanges = rest.filter((c) => matchesAny(c.path, testRoots));
  const productChanges = rest.filter((c) => !matchesAny(c.path, testRoots));

  if (spec.evidence === "exempt") {
    if (rest.length > 0) {
      return verdict(
        "evidence",
        TITLE,
        "fail",
        rest.map((c) => ({ message: "changes under an exempt mandate", path: c.path })),
      );
    }
    return verdict("evidence", TITLE, "pass", [{ message: "exempt: flip-only change" }]);
  }

  if (spec.evidence === "additive") {
    if (testChanges.length === 0) {
      return verdict("evidence", TITLE, "fail", [
        { message: "additive mandate with no new or changed tests" },
      ]);
    }
    return verdict("evidence", TITLE, "pass", [
      { message: `additive: ${testChanges.length} test file(s) changed — the assay applies` },
    ]);
  }

  const findings: Finding[] = [];
  if (productChanges.length > 0) {
    findings.push({
      message: `non-additive with ${productChanges.length} product change(s) — the cardinality guard applies`,
    });
  }
  if (testChanges.length > 0) {
    findings.push({
      message: `${testChanges.length} test file(s) changed under non-additive (extra coverage)`,
    });
  }
  return verdict("evidence", TITLE, "pass", findings);
}
