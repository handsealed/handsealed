import type { Issue, ParseResult } from "./issues.js";
import { fail, issue, ok } from "./issues.js";

export const SPEC_STATUSES = ["open", "delivered", "reverted"] as const;
export type SpecStatus = (typeof SPEC_STATUSES)[number];

export const EVIDENCE_CLASSES = ["additive", "non-additive", "exempt"] as const;
export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

/** A mandate: the frozen authorization object. */
export interface Spec {
  status: SpecStatus;
  evidence: EvidenceClass;
  /** Optional manual-smoke note for runtime/device/infra paths. */
  smoke?: string;
  /** Optional scope ceiling: glob allowlist for product paths. */
  paths?: string[];
  /** One folded paragraph: what changes and why. */
  outcome: string;
  /** Observable acceptance criteria, one per bullet. */
  acceptance: string[];
}

/**
 * Canonical field order. Enforced so that a status flip is always a
 * single-line change and canonical printing is stable.
 */
const FIELD_ORDER = ["status", "evidence", "smoke", "paths", "outcome", "acceptance"] as const;
type FieldName = (typeof FIELD_ORDER)[number];
const OPTIONAL_FIELDS: ReadonlySet<string> = new Set(["smoke", "paths"]);

const FIELD_LINE = /^([a-z-]+):(?:\s(.*))?$/;
const BULLET_LINE = /^- (.*)$/;

/**
 * Spec filenames: a sortable Crockford-base32 prefix (8-26 chars, lowercase,
 * no i/l/o/u) followed by a kebab slug. Never sequential numbers.
 */
const FILENAME = /^[0-9abcdefghjkmnpqrstvwxyz]{8,26}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

export function isValidSpecFilename(filename: string): boolean {
  return FILENAME.test(filename);
}

export function parseSpec(source: string): ParseResult<Spec> {
  const issues: Issue[] = [];
  const lines = source.split("\n");
  const seen = new Map<FieldName, string>();
  const acceptance: string[] = [];
  let orderCursor = 0;
  let outcomeLines: string[] | undefined;
  let inAcceptance = false;

  const expectInOrder = (name: FieldName, line: number): void => {
    const position = FIELD_ORDER.indexOf(name);
    if (seen.has(name)) {
      issues.push(issue(`duplicate field "${name}"`, line));
      return;
    }
    for (let i = orderCursor; i < position; i += 1) {
      const skipped = FIELD_ORDER[i];
      if (skipped !== undefined && !OPTIONAL_FIELDS.has(skipped) && !seen.has(skipped)) {
        issues.push(issue(`field "${name}" appears before required field "${skipped}"`, line));
      }
    }
    if (position < orderCursor) {
      issues.push(issue(`field "${name}" is out of canonical order`, line));
    }
    orderCursor = Math.max(orderCursor, position);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (raw === undefined) break;
    const lineNo = index + 1;
    if (raw.trim() === "") {
      outcomeLines = undefined;
      continue;
    }

    const bullet = BULLET_LINE.exec(raw);
    if (bullet !== null) {
      if (!inAcceptance) {
        issues.push(issue("bullet outside the acceptance section", lineNo));
        continue;
      }
      const text = (bullet[1] ?? "").trim();
      if (text === "") {
        issues.push(issue("empty acceptance bullet", lineNo));
        continue;
      }
      acceptance.push(text);
      continue;
    }

    const field = FIELD_LINE.exec(raw);
    if (field !== null) {
      const name = field[1] ?? "";
      const value = (field[2] ?? "").trim();
      outcomeLines = undefined;
      inAcceptance = false;
      if (!(FIELD_ORDER as readonly string[]).includes(name)) {
        issues.push(issue(`unknown field "${name}"`, lineNo));
        continue;
      }
      const known = name as FieldName;
      expectInOrder(known, lineNo);
      if (seen.has(known)) continue;
      seen.set(known, value);
      if (known === "acceptance") {
        if (value !== "")
          issues.push(issue('field "acceptance" takes no inline value; use bullets', lineNo));
        inAcceptance = true;
      } else if (known === "outcome") {
        if (value === "") issues.push(issue('field "outcome" must not be empty', lineNo));
        outcomeLines = [value];
      } else if (value === "") {
        issues.push(issue(`field "${known}" must not be empty`, lineNo));
      }
      continue;
    }

    if (outcomeLines !== undefined) {
      outcomeLines.push(raw.trim());
      seen.set("outcome", outcomeLines.join(" "));
      continue;
    }
    issues.push(issue("unrecognized line", lineNo));
  }

  for (const name of FIELD_ORDER) {
    if (!OPTIONAL_FIELDS.has(name) && !seen.has(name)) {
      issues.push(issue(`missing required field "${name}"`, lines.length));
    }
  }

  const statusRaw = seen.get("status");
  if (statusRaw !== undefined && !(SPEC_STATUSES as readonly string[]).includes(statusRaw)) {
    issues.push(issue(`invalid status "${statusRaw}" (expected: ${SPEC_STATUSES.join(" | ")})`, 1));
  }
  const evidenceRaw = seen.get("evidence");
  if (evidenceRaw !== undefined && !(EVIDENCE_CLASSES as readonly string[]).includes(evidenceRaw)) {
    issues.push(
      issue(`invalid evidence "${evidenceRaw}" (expected: ${EVIDENCE_CLASSES.join(" | ")})`, 1),
    );
  }
  if (seen.has("acceptance") && acceptance.length === 0) {
    issues.push(issue("acceptance must contain at least one bullet", lines.length));
  }

  if (issues.length > 0) return fail(issues);

  const spec: Spec = {
    status: statusRaw as SpecStatus,
    evidence: evidenceRaw as EvidenceClass,
    outcome: seen.get("outcome") ?? "",
    acceptance,
  };
  const smoke = seen.get("smoke");
  if (smoke !== undefined) spec.smoke = smoke;
  const paths = seen.get("paths");
  if (paths !== undefined) spec.paths = paths.split(/\s+/).filter((p) => p.length > 0);
  return ok(spec);
}

/** Canonical form: parse(printSpec(parseSpec(x).value)) is stable. */
export function printSpec(spec: Spec): string {
  const out: string[] = [`status: ${spec.status}`, `evidence: ${spec.evidence}`];
  if (spec.smoke !== undefined) out.push(`smoke: ${spec.smoke}`);
  if (spec.paths !== undefined && spec.paths.length > 0) out.push(`paths: ${spec.paths.join(" ")}`);
  out.push(`outcome: ${spec.outcome}`, "acceptance:");
  for (const bullet of spec.acceptance) out.push(`- ${bullet}`);
  return `${out.join("\n")}\n`;
}
