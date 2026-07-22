/**
 * The verdict model: every rule renders its judgment as a typed verdict;
 * the collection renders to check-summary markdown and stable JSON.
 *
 * Statuses: `pass`/`fail` gate; `info` is a stated fact; `attention` is
 * loud but non-gating (the badge/flag tier).
 */

/** Every rule the judge can render — exhaustive, for consumers to switch on. */
export type RuleId =
  | "lane"
  | "spec-lane"
  | "binding"
  | "authorization"
  | "config"
  | "ceiling"
  | "evidence"
  | "acceptance"
  | "cardinality"
  | "reapproval"
  | "revert";

export type RuleStatus = "pass" | "fail" | "info" | "attention";

export interface Finding {
  readonly message: string;
  readonly path?: string;
}

export interface RuleVerdict {
  readonly rule: RuleId;
  readonly title: string;
  readonly status: RuleStatus;
  readonly findings: readonly Finding[];
}

export interface Verdicts {
  readonly overall: "pass" | "fail";
  readonly rules: readonly RuleVerdict[];
}

export function verdict(
  rule: RuleId,
  title: string,
  status: RuleStatus,
  findings: readonly Finding[] = [],
): RuleVerdict {
  return { rule, title, status, findings };
}

export function collectVerdicts(rules: readonly RuleVerdict[]): Verdicts {
  return { overall: rules.some((r) => r.status === "fail") ? "fail" : "pass", rules };
}

const ICONS: Record<RuleStatus, string> = { pass: "✓", fail: "✗", info: "ℹ", attention: "⚠" };

/** Deterministic check-summary markdown; rule order is caller order. */
export function renderMarkdown(verdicts: Verdicts): string {
  const lines: string[] = [
    `## Handsealed verdict: ${verdicts.overall === "pass" ? "✓ PASS" : "✗ FAIL"}`,
  ];
  for (const rule of verdicts.rules) {
    lines.push("", `### ${ICONS[rule.status]} ${rule.title}`);
    for (const finding of rule.findings) {
      lines.push(
        finding.path === undefined
          ? `- ${finding.message}`
          : `- ${finding.message} — \`${finding.path}\``,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
