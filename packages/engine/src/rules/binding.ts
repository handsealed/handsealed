import type { ChangeKind, Facts, Oid, PathChange } from "@handsealed/facts";
import { isValidSpecFilename, parseSpec, type Spec } from "../formats/spec.js";
import { SPECS_DIR } from "./lane.js";
import type { Finding, RuleVerdict } from "./verdict.js";
import { verdict } from "./verdict.js";

/**
 * Discriminated: a valid binding carries the bound mandate; a failure carries
 * only the verdict. Two accepted shapes: `flip` (the mandate existed open at
 * base and only its status line changed) and `oneshot` (the mandate is created
 * directly as delivered in this change — authorized solely by a code-owner
 * signature, which the judge enforces fail-closed).
 */
export type BindingResult =
  | { readonly ok: false; readonly verdict: RuleVerdict }
  | {
      readonly ok: true;
      readonly verdict: RuleVerdict;
      readonly mode: "flip" | "oneshot";
      /** The bound mandate, parsed at head. */
      readonly spec: Spec;
      readonly flipPath: string;
      readonly slug: string;
    };

const TITLE = "Mandate binding";
const fail = (findings: readonly Finding[]): BindingResult => ({
  ok: false,
  verdict: verdict("binding", TITLE, "fail", findings),
});

const REFUSALS: Record<Exclude<ChangeKind, "modified" | "added">, string> = {
  deleted: "specs are never deleted by implementation changes",
  renamed: "specs are never renamed by implementation changes",
  copied: "specs are never copied by implementation changes",
  typechange: "spec type changes are not a flip",
};

const isSpecFile = (path: string): boolean => path.endsWith(".md");
const isSigFile = (path: string): boolean => path.endsWith(".sig");
const isRedFile = (path: string): boolean => path.endsWith(".red.json");

/** `specs/<slug>.sig` is a companion iff `<slug>.md` would be a valid spec filename. */
export function isSignatureCompanion(path: string): boolean {
  if (!path.startsWith(SPECS_DIR) || !isSigFile(path)) return false;
  const filename = path.slice(path.lastIndexOf("/") + 1);
  return isValidSpecFilename(`${filename.slice(0, -".sig".length)}.md`);
}

/** `specs/<slug>.red.json` is a companion iff `<slug>.md` would be a valid spec filename. */
export function isRedReceiptCompanion(path: string): boolean {
  if (!path.startsWith(SPECS_DIR) || !isRedFile(path)) return false;
  const filename = path.slice(path.lastIndexOf("/") + 1);
  return isValidSpecFilename(`${filename.slice(0, -".red.json".length)}.md`);
}

/**
 * The binding ties an implementation change to exactly one mandate. Flip: the
 * only changed bytes are `status: open` becoming `status: delivered` on the
 * canonical first line of a spec that already exists — open — at base.
 * One-shot: the spec is created in this change already `delivered`; the
 * accompanying code-owner signature (not presence at base) is what authorizes
 * it, so the judge requires that signature fail-closed.
 */
export async function validateBinding(
  facts: Facts,
  base: Oid,
  head: Oid,
  changes: readonly PathChange[],
): Promise<BindingResult> {
  const specTouches = changes.filter(
    (change) =>
      change.path.startsWith(SPECS_DIR) || (change.fromPath?.startsWith(SPECS_DIR) ?? false),
  );
  const specChanges = specTouches.filter(
    (change) =>
      isSpecFile(change.path) || (change.fromPath !== undefined && isSpecFile(change.fromPath)),
  );
  const sigChanges = specTouches.filter(
    (change) =>
      isSigFile(change.path) || (change.fromPath !== undefined && isSigFile(change.fromPath)),
  );
  const receiptChanges = specTouches.filter(
    (change) =>
      isRedFile(change.path) || (change.fromPath !== undefined && isRedFile(change.fromPath)),
  );
  const strays = specTouches.filter(
    (change) =>
      !specChanges.includes(change) &&
      !sigChanges.includes(change) &&
      !receiptChanges.includes(change),
  );
  if (strays.length > 0) {
    return fail(
      strays.map((stray) => ({ message: "unexpected file under specs/", path: stray.path })),
    );
  }

  const change = specChanges[0];
  if (change === undefined) {
    return fail([{ message: "no mandate: an implementation change must flip exactly one spec" }]);
  }
  if (specChanges.length > 1) {
    return fail(
      specChanges.map((extra) => ({ message: "more than one spec touched", path: extra.path })),
    );
  }
  if (change.kind !== "modified" && change.kind !== "added") {
    return fail([{ message: REFUSALS[change.kind], path: change.path }]);
  }
  const flipPath = change.path;
  const filename = flipPath.slice(flipPath.lastIndexOf("/") + 1);
  if (!isValidSpecFilename(filename)) {
    return fail([{ message: "invalid spec filename", path: flipPath }]);
  }
  const slug = filename.slice(0, filename.length - ".md".length);

  const foreignSigs = sigChanges.filter((sig) => sig.path !== `${SPECS_DIR}${slug}.sig`);
  if (foreignSigs.length > 0) {
    return fail(
      foreignSigs.map((sig) => ({
        message: "only the bound mandate's own signature may ride the change",
        path: sig.path,
      })),
    );
  }
  const foreignReceipts = receiptChanges.filter(
    (receipt) => receipt.path !== `${SPECS_DIR}${slug}.red.json`,
  );
  if (foreignReceipts.length > 0) {
    return fail(
      foreignReceipts.map((receipt) => ({
        message: "only the bound mandate's own red receipt may ride the change",
        path: receipt.path,
      })),
    );
  }

  const headContent = await facts.fileAtRef(head, flipPath);
  if (headContent === null) {
    return fail([{ message: "spec missing at head", path: flipPath }]);
  }
  const headParsed = parseSpec(headContent);
  if (!headParsed.ok) {
    return fail(
      headParsed.issues.map((problem) => ({
        message: `head spec invalid: ${problem.message}`,
        path: flipPath,
      })),
    );
  }
  if (headParsed.value.status !== "delivered") {
    const message =
      change.kind === "added"
        ? "spec created open in the same change — an open mandate authorizes nothing; deliver it signed (one-shot) or land it first"
        : `flip must set status to "delivered"`;
    return fail([{ message, path: flipPath }]);
  }

  if (change.kind === "added") {
    return {
      ok: true,
      verdict: verdict("binding", TITLE, "pass", [
        {
          message: "mandate created delivered in this change — one-shot, signature required",
          path: flipPath,
        },
      ]),
      mode: "oneshot",
      spec: headParsed.value,
      flipPath,
      slug,
    };
  }

  const baseContent = await facts.fileAtRef(base, flipPath);
  if (baseContent === null) {
    return fail([
      { message: "spec does not exist at base — nothing authorized this", path: flipPath },
    ]);
  }
  const baseParsed = parseSpec(baseContent);
  if (!baseParsed.ok) {
    return fail(
      baseParsed.issues.map((problem) => ({
        message: `base spec invalid: ${problem.message}`,
        path: flipPath,
      })),
    );
  }
  if (baseParsed.value.status !== "open") {
    const why =
      baseParsed.value.status === "delivered"
        ? "already delivered — a mandate never authorizes twice"
        : "mandate was reverted — it never authorizes again";
    return fail([{ message: why, path: flipPath }]);
  }

  const baseLines = baseContent.split("\n");
  const headLines = headContent.split("\n");
  const flipIsClean =
    baseLines[0] === "status: open" &&
    headLines[0] === "status: delivered" &&
    baseLines.length === headLines.length &&
    baseLines.slice(1).join("\n") === headLines.slice(1).join("\n");
  if (!flipIsClean) {
    return fail([{ message: "the flip must change nothing but the status line", path: flipPath }]);
  }

  return {
    ok: true,
    verdict: verdict("binding", TITLE, "pass", [
      { message: "mandate open at base, delivered at head; flip is byte-clean", path: flipPath },
    ]),
    mode: "flip",
    spec: headParsed.value,
    flipPath,
    slug,
  };
}
