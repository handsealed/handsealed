import type { PatchIdentity } from "@handsealed/facts";
import type { Finding, RuleVerdict } from "./verdict.js";
import { verdict } from "./verdict.js";

const TITLE = "Since your approval";

/**
 * The re-approval fact: is the current diff patch-identical to the one the
 * human last approved? Equality is claimed only on an exact combined match
 * from the same implementation — everything else reads as changed, with the
 * per-file delta named. Erring toward "changed" costs a re-read; erring the
 * other way would cost the truth.
 */
export function reapprovalFact(
  approved: PatchIdentity | null,
  current: PatchIdentity,
): RuleVerdict {
  if (approved === null) {
    return verdict("reapproval", TITLE, "info", [{ message: "no approved snapshot yet" }]);
  }
  if (approved.combined === current.combined) {
    return verdict("reapproval", TITLE, "pass", [
      { message: "content unchanged since your approval — only the base moved" },
    ]);
  }
  const approvedIds = new Map(approved.files.map((f) => [f.path, f.id]));
  const currentIds = new Map(current.files.map((f) => [f.path, f.id]));
  const findings: Finding[] = [];
  for (const [path, id] of currentIds) {
    const before = approvedIds.get(path);
    if (before === undefined) findings.push({ message: "new since approval", path });
    else if (before !== id) findings.push({ message: "changed since approval", path });
  }
  for (const path of approvedIds.keys()) {
    if (!currentIds.has(path)) findings.push({ message: "no longer changed since approval", path });
  }
  if (findings.length === 0) {
    findings.push({ message: "diff content shifted since approval" });
  }
  return verdict("reapproval", TITLE, "attention", findings);
}
