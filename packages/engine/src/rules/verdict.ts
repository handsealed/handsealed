/**
 * The verdict model: every rule renders its judgment as a typed verdict;
 * the collection renders to check-summary markdown and stable JSON.
 *
 * Statuses: `pass`/`fail` gate; `info` is a stated fact; `attention` is
 * loud but non-gating (the badge/flag tier).
 */

export type RuleStatus = "pass" | "fail" | "info" | "attention";

export interface Finding {
  message: string;
  path?: string;
}

export interface RuleVerdict {
  rule: string;
  title: string;
  status: RuleStatus;
  findings: Finding[];
}

export interface Verdicts {
  overall: "pass" | "fail";
  rules: RuleVerdict[];
}

export function verdict(
  rule: string,
  title: string,
  status: RuleStatus,
  findings: Finding[] = [],
): RuleVerdict {
  return { rule, title, status, findings };
}

export function collectVerdicts(rules: RuleVerdict[]): Verdicts {
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
