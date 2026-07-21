import type { CommitRange, Facts, Oid } from "@handsealed/facts";
import type { RuleVerdict } from "./verdict.js";
import { verdict } from "./verdict.js";

const TITLE = "Revert integrity";

/**
 * The revert lane's check: the revert's diff must be patch-identical to the
 * inverse of the reverted commit's diff (computed by swapping the range).
 * Every trustworthy loop needs an escape hatch that is itself checkable.
 */
export async function checkRevert(
  facts: Facts,
  revert: CommitRange,
  original: { parent: Oid; head: Oid },
): Promise<RuleVerdict> {
  const [revertId, inverseId] = await Promise.all([
    facts.patchIdOf(revert.base, revert.head),
    facts.patchIdOf(original.head, original.parent),
  ]);
  if (revertId.combined === inverseId.combined) {
    return verdict("revert", TITLE, "pass", [
      { message: "patch-identical to the inverse of the reverted commit" },
    ]);
  }
  const inverseIds = new Map(inverseId.files.map((f) => [f.path, f.id]));
  const mismatched = revertId.files
    .filter((f) => inverseIds.get(f.path) !== f.id)
    .map((f) => ({ message: "not a pure inversion", path: f.path }));
  for (const file of inverseId.files) {
    if (!revertId.files.some((f) => f.path === file.path)) {
      mismatched.push({ message: "reverted change not restored", path: file.path });
    }
  }
  return verdict(
    "revert",
    TITLE,
    "fail",
    mismatched.length > 0 ? mismatched : [{ message: "revert diff does not invert the original" }],
  );
}
