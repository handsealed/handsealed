import type { ChangeKind, Facts, Oid, PathChange } from "@handsealed/facts";
import { isValidSpecFilename, parseSpec, type Spec } from "../formats/spec.js";
import { SPECS_DIR } from "./lane.js";
import type { Finding, RuleVerdict } from "./verdict.js";
import { verdict } from "./verdict.js";

/** Discriminated: a valid flip carries the bound mandate; a failure carries only the verdict. */
export type BindingResult =
  | { readonly ok: false; readonly verdict: RuleVerdict }
  | {
      readonly ok: true;
      readonly verdict: RuleVerdict;
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

const REFUSALS: Record<Exclude<ChangeKind, "modified">, string> = {
  added: "spec created in the same change — self-authorization is impossible",
  deleted: "specs are never deleted by implementation changes",
  renamed: "specs are never renamed by implementation changes",
  copied: "specs are never copied by implementation changes",
  typechange: "spec type changes are not a flip",
};

/**
 * The status flip is the binding: exactly one spec file changes, and the
 * only changed bytes are `status: open` becoming `status: delivered` on the
 * canonical first line. The spec must already exist — open — at base.
 */
export async function validateBinding(
  facts: Facts,
  base: Oid,
  head: Oid,
  changes: readonly PathChange[],
): Promise<BindingResult> {
  const specChanges = changes.filter(
    (change) =>
      change.path.startsWith(SPECS_DIR) || (change.fromPath?.startsWith(SPECS_DIR) ?? false),
  );
  const change = specChanges[0];
  if (change === undefined) {
    return fail([{ message: "no mandate: an implementation change must flip exactly one spec" }]);
  }
  if (specChanges.length > 1) {
    return fail(
      specChanges.map((extra) => ({ message: "more than one spec touched", path: extra.path })),
    );
  }
  if (change.kind !== "modified") {
    return fail([{ message: REFUSALS[change.kind], path: change.path }]);
  }
  const flipPath = change.path;
  const filename = flipPath.slice(flipPath.lastIndexOf("/") + 1);
  if (!isValidSpecFilename(filename)) {
    return fail([{ message: "invalid spec filename", path: flipPath }]);
  }

  const [baseContent, headContent] = await Promise.all([
    facts.fileAtRef(base, flipPath),
    facts.fileAtRef(head, flipPath),
  ]);
  if (baseContent === null) {
    return fail([
      { message: "spec does not exist at base — nothing authorized this", path: flipPath },
    ]);
  }
  if (headContent === null) {
    return fail([{ message: "spec missing at head", path: flipPath }]);
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
    return fail([{ message: `flip must set status to "delivered"`, path: flipPath }]);
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
    spec: headParsed.value,
    flipPath,
    slug: filename.slice(0, filename.length - ".md".length),
  };
}
