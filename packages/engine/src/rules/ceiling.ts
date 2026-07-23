import type { PathChange } from "@handsealed/facts";
import type { Mandate } from "../formats/mandate.js";
import { matchesAny } from "./glob.js";
import type { RuleVerdict } from "./verdict.js";
import { verdict } from "./verdict.js";

const TITLE = "Scope ceiling";

/**
 * The `paths:` ceiling is the approved blast radius. Every changed product
 * path must fall inside it; test roots and the config's exempt paths are
 * always allowed; the flip itself is exempt. No declared ceiling means no
 * ceiling — stated, not implied.
 */
export function checkCeiling(
  spec: Mandate,
  changes: readonly PathChange[],
  flipPath: string,
  testRoots: readonly string[],
  exemptPaths: readonly string[] = [],
): RuleVerdict {
  const ceiling = spec.paths;
  if (ceiling === undefined || ceiling.length === 0) {
    return verdict("ceiling", TITLE, "info", [{ message: "no ceiling declared in the mandate" }]);
  }
  const breaches = changes.filter((change) => {
    if (change.path === flipPath) return false;
    const paths = change.fromPath === undefined ? [change.path] : [change.path, change.fromPath];
    return paths.some(
      (p) => !matchesAny(p, testRoots) && !matchesAny(p, exemptPaths) && !matchesAny(p, ceiling),
    );
  });
  if (breaches.length > 0) {
    return verdict(
      "ceiling",
      TITLE,
      "fail",
      breaches.map((c) => ({ message: "out of mandate", path: c.path })),
    );
  }
  return verdict("ceiling", TITLE, "pass", [
    { message: `all changes within the approved ceiling (${ceiling.join(" ")})` },
  ]);
}
