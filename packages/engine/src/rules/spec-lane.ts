import type { Facts, Oid, PathChange } from "@handsealed/facts";
import { isValidSpecFilename, parseSpec } from "../formats/spec.js";
import type { Finding, RuleVerdict } from "./verdict.js";
import { verdict } from "./verdict.js";

const TITLE = "Spec lane";

/**
 * Spec-lane diffs create or amend mandates: every changed spec must parse,
 * carry a valid filename, and remain `open` — status flips happen only in
 * implementation changes, and specs are never deleted or renamed.
 *
 * Amendments may only touch mandates that are still open at base: a
 * delivered or reverted mandate is immutable history, so a change that
 * rewrites one back to `open` (a reopen — the two-step replay) is refused.
 */
export async function validateSpecLane(
  facts: Facts,
  base: Oid,
  head: Oid,
  changes: readonly PathChange[],
): Promise<RuleVerdict> {
  const findings: Finding[] = [];
  for (const change of changes) {
    if (change.kind === "deleted") {
      findings.push({ message: "specs are never deleted", path: change.path });
      continue;
    }
    if (change.kind === "renamed" || change.kind === "copied") {
      findings.push({ message: "specs are never renamed or copied", path: change.path });
      continue;
    }
    const filename = change.path.slice(change.path.lastIndexOf("/") + 1);
    if (!isValidSpecFilename(filename)) {
      findings.push({ message: "invalid spec filename", path: change.path });
      continue;
    }
    if (change.kind === "modified") {
      const baseContent = await facts.fileAtRef(base, change.path);
      if (baseContent !== null) {
        const baseParsed = parseSpec(baseContent);
        if (baseParsed.ok && baseParsed.value.status !== "open") {
          findings.push({
            message: `a ${baseParsed.value.status} mandate is immutable history — it is never reopened or edited`,
            path: change.path,
          });
          continue;
        }
      }
    }
    const content = await facts.fileAtRef(head, change.path);
    if (content === null) {
      findings.push({ message: "spec missing at head", path: change.path });
      continue;
    }
    const parsed = parseSpec(content);
    if (!parsed.ok) {
      for (const problem of parsed.issues) {
        findings.push({ message: `invalid spec: ${problem.message}`, path: change.path });
      }
      continue;
    }
    if (parsed.value.status !== "open") {
      findings.push({
        message: "spec-lane changes stay open — status flips happen in implementation changes",
        path: change.path,
      });
    }
  }
  if (findings.length > 0) {
    return verdict("spec-lane", TITLE, "fail", findings);
  }
  return verdict("spec-lane", TITLE, "pass", [
    { message: `${changes.length} spec(s) valid and open` },
  ]);
}
