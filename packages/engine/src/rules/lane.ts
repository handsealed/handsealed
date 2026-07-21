import type { PathChange } from "../facts.js";
import type { RuleVerdict } from "./verdict.js";
import { verdict } from "./verdict.js";

export const SPECS_DIR = "specs/";
const MAINTENANCE_DIRS = [".github/"] as const;

export type Lane = "spec" | "implementation" | "maintenance";

export interface LaneResult {
  lane: Lane;
  verdict: RuleVerdict;
}

const touches = (change: PathChange, prefix: string): boolean =>
  change.path.startsWith(prefix) || (change.fromPath?.startsWith(prefix) ?? false);

/**
 * The lane is computed from the diff, never declared. Spec lane: every path
 * under specs/. Maintenance lane: every path under a maintenance dir.
 * Everything else is the implementation lane, where the thin fence applies:
 * implementation changes may not touch workflows.
 */
export function classifyLane(changes: PathChange[]): LaneResult {
  if (changes.length === 0) {
    return {
      lane: "implementation",
      verdict: verdict("lane", "Lane", "fail", [{ message: "empty change set" }]),
    };
  }
  if (changes.every((c) => touches(c, SPECS_DIR) && c.path.startsWith(SPECS_DIR))) {
    return { lane: "spec", verdict: verdict("lane", "Lane: spec", "pass") };
  }
  if (changes.every((c) => MAINTENANCE_DIRS.some((dir) => touches(c, dir)))) {
    return { lane: "maintenance", verdict: verdict("lane", "Lane: maintenance", "pass") };
  }
  const fenced = changes.filter((c) => MAINTENANCE_DIRS.some((dir) => touches(c, dir)));
  if (fenced.length > 0) {
    return {
      lane: "implementation",
      verdict: verdict(
        "lane",
        "Lane: implementation",
        "fail",
        fenced.map((c) => ({
          message: "implementation changes may not touch workflows (maintenance lane)",
          path: c.path,
        })),
      ),
    };
  }
  return { lane: "implementation", verdict: verdict("lane", "Lane: implementation", "pass") };
}
