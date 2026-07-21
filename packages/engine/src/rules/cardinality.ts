import type { Finding, RuleVerdict } from "./verdict.js";
import { verdict } from "./verdict.js";

const TITLE = "Suite cardinality";

/**
 * Compares per-suite test counts against the baseline. A decrease is the
 * *effect* of every test-weakening trick, whatever the cause — flagged
 * loudly, never silently. Missing baseline degrades to a stated fact,
 * never a silent pass.
 */
export function compareCardinality(
  baseline: Record<string, number> | undefined,
  head: Record<string, number>,
): RuleVerdict {
  if (baseline === undefined) {
    return verdict("cardinality", TITLE, "info", [{ message: "no baseline — counts unverified" }]);
  }
  const findings: Finding[] = [];
  let flagged = false;
  for (const [suite, baseCount] of Object.entries(baseline)) {
    const headCount = head[suite];
    if (headCount === undefined) {
      findings.push({ message: `suite "${suite}" disappeared (${baseCount} → none)` });
      flagged = true;
    } else if (headCount < baseCount) {
      findings.push({ message: `suite "${suite}" shrank: ${baseCount} → ${headCount}` });
      flagged = true;
    }
  }
  for (const [suite, headCount] of Object.entries(head)) {
    if (baseline[suite] === undefined) {
      findings.push({ message: `new suite "${suite}" (${headCount} test(s))` });
    }
  }
  if (flagged) {
    return verdict("cardinality", TITLE, "attention", findings);
  }
  if (findings.length === 0) {
    findings.push({ message: "no suite shrank" });
  }
  return verdict("cardinality", TITLE, "pass", findings);
}
