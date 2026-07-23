import type { Facts, Oid, PathChange } from "@handsealed/facts";
import { parseRedReceipt } from "../formats/red.js";
import type { Spec } from "../formats/spec.js";
import { matchesAny } from "./glob.js";
import { SPECS_DIR } from "./lane.js";
import type { Finding, RuleVerdict } from "./verdict.js";
import { verdict } from "./verdict.js";

const TITLE = "Red proof";

export const redReceiptPath = (slug: string): string => `${SPECS_DIR}${slug}.red.json`;

const fail = (findings: readonly Finding[]): RuleVerdict => verdict("red", TITLE, "fail", findings);
const short = (sha: string): string => sha.slice(0, 8);

/**
 * Fail-first attestation. The receipt claims the mandate's acceptance cases
 * failed at a test-only checkpoint; the rule verifies the claim three ways:
 * coverage (every acceptance marker appears among the receipt's failing
 * cases), checkpoint shape (the sha is an ancestor of head and its diff from
 * base touches only testRoots), and freeze (every marker-carrying test file
 * is byte-identical between the checkpoint and head — the checkpoint tests
 * were never edited after the red run). After a squash-merge the checkpoint
 * commit is unreachable; the receipt then stands as the durable record and
 * the verdict says so instead of failing (attention, structural checks only).
 * `redRequired: additive` makes a missing receipt fail for additive mandates.
 * Non-additive mandates with no receipt owe nothing and render no rule (null).
 */
export async function checkRed(
  facts: Facts,
  base: Oid,
  head: Oid,
  spec: Spec,
  slug: string,
  changes: readonly PathChange[],
  testRoots: readonly string[],
  redRequired: "off" | "additive",
): Promise<RuleVerdict | null> {
  const path = redReceiptPath(slug);
  const raw = await facts.fileAtRef(head, path);
  if (raw === null) {
    if (spec.evidence !== "additive") return null;
    if (redRequired === "additive") {
      return fail([
        {
          message:
            "no red receipt — redRequired: additive demands fail-first proof for an additive mandate",
          path,
        },
      ]);
    }
    return verdict("red", TITLE, "info", [{ message: "no red receipt — fail-first not attested" }]);
  }
  const parsed = parseRedReceipt(raw);
  if (!parsed.ok) {
    return fail([{ message: `invalid red receipt: ${parsed.issue}`, path }]);
  }
  const receipt = parsed.receipt;
  if (spec.evidence !== "additive") {
    return verdict("red", TITLE, "info", [
      { message: "red receipt present but not required for a non-additive mandate", path },
    ]);
  }

  const missing: number[] = [];
  for (let bullet = 1; bullet <= spec.acceptance.length; bullet += 1) {
    const marker = `[${slug}#${bullet}]`;
    if (!receipt.cases.some((redCase) => redCase.name.includes(marker))) {
      missing.push(bullet);
    }
  }
  if (missing.length > 0) {
    return fail([
      {
        message: `the receipt shows no failing case for acceptance bullet(s) ${missing.join(", ")}`,
        path,
      },
    ]);
  }

  let ancestor: boolean;
  try {
    ancestor = await facts.isAncestor(receipt.sha, head);
  } catch {
    return verdict("red", TITLE, "attention", [
      {
        message:
          `checkpoint ${short(receipt.sha)} is not reachable — structural checks only ` +
          "(expected after a squash-merge; the receipt is the durable record)",
        path,
      },
    ]);
  }
  if (!ancestor) {
    return fail([
      { message: `checkpoint ${short(receipt.sha)} is not an ancestor of the judged head`, path },
    ]);
  }

  const checkpointChanges = await facts.pathsChanged(base, receipt.sha);
  const offenders = checkpointChanges.filter((change) => !matchesAny(change.path, testRoots));
  if (offenders.length > 0) {
    return fail(
      offenders.map((offender) => ({
        message: "the checkpoint must be test-only — this file is outside every test root",
        path: offender.path,
      })),
    );
  }

  const edited: string[] = [];
  for (const change of changes) {
    if (change.kind === "deleted" || !matchesAny(change.path, testRoots)) continue;
    const headContent = await facts.fileAtRef(head, change.path);
    if (headContent === null || !headContent.includes(`[${slug}#`)) continue;
    const checkpointContent = await facts.fileAtRef(receipt.sha, change.path);
    if (checkpointContent !== headContent) {
      edited.push(change.path);
    }
  }
  if (edited.length > 0) {
    return fail(
      edited.map((file) => ({
        message: "checkpoint tests were edited after the red run — the red no longer proves them",
        path: file,
      })),
    );
  }

  return verdict("red", TITLE, "pass", [
    {
      message:
        `red attested: ${receipt.cases.length} marked case(s) failed at ` +
        `${short(receipt.sha)}; checkpoint test-only and frozen`,
      path,
    },
  ]);
}
