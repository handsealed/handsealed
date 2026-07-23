import type { PathChange } from "@handsealed/facts";
import { matchesAny } from "./glob.js";
import type { RuleVerdict } from "./verdict.js";
import { verdict } from "./verdict.js";

export const SPECS_DIR = "specs/";
const MAINTENANCE_DIRS = [".github/"] as const;

export type Lane = "mandate" | "implementation" | "maintenance";

export interface LaneResult {
  readonly lane: Lane;
  readonly verdict: RuleVerdict;
}

/** Both sides of the change (path, and fromPath for renames) sit under `prefix`. */
const within = (change: PathChange, prefix: string): boolean =>
  change.path.startsWith(prefix) &&
  (change.fromPath === undefined || change.fromPath.startsWith(prefix));

/** Either side of the change sits under `prefix`. */
const touches = (change: PathChange, prefix: string): boolean =>
  change.path.startsWith(prefix) || (change.fromPath?.startsWith(prefix) ?? false);

/** Either side of the change matches one of the exempt globs. */
const touchesOnlyExempt = (change: PathChange, exemptPaths: readonly string[]): boolean =>
  exemptPaths.length > 0 &&
  matchesAny(change.path, exemptPaths) &&
  (change.fromPath === undefined || matchesAny(change.fromPath, exemptPaths));

/**
 * The lane is computed from the diff, never declared. Mandate lane: every
 * change entirely within specs/ (a rename crossing the boundary is not a
 * mandate-lane change). Maintenance lane: every change touching only
 * maintenance dirs or the base config's exemptPaths (docs and repo trivia
 * need no mandate). Everything else is the implementation lane, where the
 * thin fence applies: implementation changes may not touch workflows —
 * exempt files, by contrast, may ride an implementation change freely.
 */
export function classifyLane(
  changes: readonly PathChange[],
  exemptPaths: readonly string[] = [],
): LaneResult {
  if (changes.length === 0) {
    return {
      lane: "implementation",
      verdict: verdict("lane", "Lane", "fail", [{ message: "empty change set" }]),
    };
  }
  if (changes.every((change) => within(change, SPECS_DIR))) {
    return { lane: "mandate", verdict: verdict("lane", "Lane: mandate", "pass") };
  }
  if (
    changes.every(
      (change) =>
        MAINTENANCE_DIRS.some((dir) => touches(change, dir)) ||
        touchesOnlyExempt(change, exemptPaths),
    )
  ) {
    return { lane: "maintenance", verdict: verdict("lane", "Lane: maintenance", "pass") };
  }
  const fenced = changes.filter((change) => MAINTENANCE_DIRS.some((dir) => touches(change, dir)));
  if (fenced.length > 0) {
    return {
      lane: "implementation",
      verdict: verdict(
        "lane",
        "Lane: implementation",
        "fail",
        fenced.map((change) => ({
          message: "implementation changes may not touch workflows (maintenance lane)",
          path: change.path,
        })),
      ),
    };
  }
  return { lane: "implementation", verdict: verdict("lane", "Lane: implementation", "pass") };
}
