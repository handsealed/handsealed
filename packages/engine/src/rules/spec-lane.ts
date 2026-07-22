import type { Facts, Oid, PathChange } from "@handsealed/facts";
import { isValidSpecFilename, parseSpec } from "../formats/spec.js";
import { isSignatureCompanion } from "./binding.js";
import type { Finding, RuleVerdict } from "./verdict.js";
import { verdict } from "./verdict.js";

const TITLE = "Spec lane";
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Spec-lane diffs create or amend mandates: every changed spec must parse,
 * carry a valid filename, and remain `open` — status flips happen only in
 * implementation changes, and specs are never deleted or renamed. A
 * `specs/<slug>.sig` signature companion (a code owner pre-authorizing a
 * mandate) is welcome alongside; it only needs to be base64.
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
    if (isSignatureCompanion(change.path)) {
      const signature = await facts.fileAtRef(head, change.path);
      if (signature === null || !BASE64.test(signature.trim())) {
        findings.push({ message: "signature is not valid base64", path: change.path });
      }
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
  const sigCount = changes.filter((change) => isSignatureCompanion(change.path)).length;
  const specCount = changes.length - sigCount;
  return verdict("spec-lane", TITLE, "pass", [
    {
      message:
        sigCount > 0
          ? `${specCount} spec(s) valid and open; ${sigCount} signature companion(s)`
          : `${specCount} spec(s) valid and open`,
    },
  ]);
}
