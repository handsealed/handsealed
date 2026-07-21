import type { Facts, Oid, PathChange } from "./facts.js";
import { parseConfig } from "./formats/config.js";
import { parseSpec } from "./formats/spec.js";
import { validateBinding } from "./rules/binding.js";
import { checkCeiling } from "./rules/ceiling.js";
import { checkEvidenceConsistency } from "./rules/evidence.js";
import { classifyLane } from "./rules/lane.js";
import { validateSpecLane } from "./rules/spec-lane.js";
import type { RuleVerdict, Verdicts } from "./rules/verdict.js";
import { collectVerdicts, verdict } from "./rules/verdict.js";

export const CONFIG_PATH = ".handsealed.yml";

interface LoadedConfig {
  testRoots: readonly string[] | null;
  verdict: RuleVerdict | null;
}

async function loadConfig(facts: Facts, head: Oid): Promise<LoadedConfig> {
  const raw = await facts.fileAtRef(head, CONFIG_PATH);
  if (raw === null) {
    return {
      testRoots: null,
      verdict: verdict("config", "Config", "info", [
        { message: `no ${CONFIG_PATH} at head — ceiling and evidence checks skipped` },
      ]),
    };
  }
  const parsed = parseConfig(raw);
  if (!parsed.ok) {
    return {
      testRoots: null,
      verdict: verdict(
        "config",
        "Config",
        "fail",
        parsed.issues.map((issue) => ({
          message: `${issue.message} (line ${issue.line})`,
          path: CONFIG_PATH,
        })),
      ),
    };
  }
  return { testRoots: parsed.value.testRoots, verdict: null };
}

async function implementationRules(
  facts: Facts,
  base: Oid,
  head: Oid,
  changes: PathChange[],
): Promise<RuleVerdict[]> {
  const rules: RuleVerdict[] = [];
  const binding = await validateBinding(facts, base, head, changes);
  rules.push(binding.verdict);
  if (binding.spec !== undefined && binding.flipPath !== undefined) {
    const config = await loadConfig(facts, head);
    if (config.verdict !== null) rules.push(config.verdict);
    if (config.testRoots !== null) {
      rules.push(checkCeiling(binding.spec, changes, binding.flipPath, config.testRoots));
      rules.push(
        checkEvidenceConsistency(binding.spec, changes, binding.flipPath, config.testRoots),
      );
    }
  }
  return rules;
}

/**
 * A lone modified spec is ambiguous by paths alone: an amendment (stays
 * open — spec lane) or a flip-only delivery, the `exempt` mandate's exact
 * shape (routes to the implementation lane, where binding validates it).
 * Content disambiguates: head status `delivered` means flip.
 */
async function isFlipOnly(facts: Facts, head: Oid, changes: PathChange[]): Promise<boolean> {
  const only = changes.length === 1 ? changes[0] : undefined;
  if (only === undefined || only.kind !== "modified") return false;
  const content = await facts.fileAtRef(head, only.path);
  if (content === null) return false;
  const parsed = parseSpec(content);
  return parsed.ok && parsed.value.status === "delivered";
}

/**
 * The offline judge: the static rule set over a base..head range — lane,
 * then per lane: spec validation, or binding + ceiling + evidence
 * consistency. This exact composition is what every surface replays;
 * the CLI and any hosted judge are thin shells over it.
 */
export async function judge(facts: Facts, base: Oid, head: Oid): Promise<Verdicts> {
  const changes = await facts.pathsChanged(base, head);
  const lane = classifyLane(changes);
  const rules: RuleVerdict[] = [lane.verdict];

  if (lane.lane === "spec") {
    if (await isFlipOnly(facts, head, changes)) {
      rules[0] = verdict("lane", "Lane: implementation", "pass", [
        { message: "flip-only change routed to the implementation lane" },
      ]);
      rules.push(...(await implementationRules(facts, base, head, changes)));
    } else {
      rules.push(await validateSpecLane(facts, head, changes));
    }
  } else if (lane.lane === "implementation") {
    rules.push(...(await implementationRules(facts, base, head, changes)));
  }

  return collectVerdicts(rules);
}
