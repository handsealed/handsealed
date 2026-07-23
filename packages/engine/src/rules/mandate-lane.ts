import type { Facts, Oid, PathChange } from "@handsealed/facts";
import { isValidMandateFilename, parseMandate } from "../formats/mandate.js";
import { looksLikeSshSignature, parseSshSignatures } from "../formats/sshsig.js";
import { isRedReceiptCompanion, isSignatureCompanion } from "./binding.js";
import type { Finding, RuleVerdict } from "./verdict.js";
import { verdict } from "./verdict.js";

const TITLE = "Mandate lane";

/**
 * Mandate-lane diffs create or amend mandates: every changed mandate must parse,
 * carry a valid filename, and remain `open` — status flips happen only in
 * implementation changes, and specs are never deleted or renamed. A
 * `specs/<slug>.sig` signature companion (a code owner pre-authorizing a
 * mandate) is welcome alongside as an SSH signature envelope.
 *
 * Amendments may only touch mandates that are still open at base: a
 * delivered or reverted mandate is immutable history, so a change that
 * rewrites one back to `open` (a reopen — the two-step replay) is refused.
 */
export async function validateMandateLane(
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
      const envelope =
        signature !== null && looksLikeSshSignature(signature) && parseSshSignatures(signature).ok;
      if (!envelope) {
        findings.push({
          message: "signature companion is not a valid SSH signature envelope",
          path: change.path,
        });
      }
      continue;
    }
    if (isRedReceiptCompanion(change.path)) {
      findings.push({
        message: "a red receipt rides its delivering implementation change, not the mandate lane",
        path: change.path,
      });
      continue;
    }
    const filename = change.path.slice(change.path.lastIndexOf("/") + 1);
    if (!isValidMandateFilename(filename)) {
      findings.push({ message: "invalid mandate filename", path: change.path });
      continue;
    }
    if (change.kind === "modified") {
      const baseContent = await facts.fileAtRef(base, change.path);
      if (baseContent !== null) {
        const baseParsed = parseMandate(baseContent);
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
      findings.push({ message: "mandate missing at head", path: change.path });
      continue;
    }
    const parsed = parseMandate(content);
    if (!parsed.ok) {
      for (const problem of parsed.issues) {
        findings.push({ message: `invalid mandate: ${problem.message}`, path: change.path });
      }
      continue;
    }
    if (parsed.value.status !== "open") {
      findings.push({
        message: "a mandate stays open in its lane — status flips happen in implementation changes",
        path: change.path,
      });
    }
  }
  if (findings.length > 0) {
    return verdict("mandate-lane", TITLE, "fail", findings);
  }
  const sigCount = changes.filter((change) => isSignatureCompanion(change.path)).length;
  const specCount = changes.length - sigCount;
  return verdict("mandate-lane", TITLE, "pass", [
    {
      message:
        sigCount > 0
          ? `${specCount} mandate(s) valid and open; ${sigCount} signature companion(s)`
          : `${specCount} mandate(s) valid and open`,
    },
  ]);
}
