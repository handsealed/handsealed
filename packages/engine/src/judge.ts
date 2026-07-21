import type { Facts, Oid, PathChange } from "@handsealed/facts";
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

type LoadedConfig =
  | { readonly ok: true; readonly testRoots: readonly string[] }
  | { readonly ok: false; readonly verdict: RuleVerdict };

async function loadConfig(facts: Facts, head: Oid): Promise<LoadedConfig> {
  const raw = await facts.fileAtRef(head, CONFIG_PATH);
  if (raw === null) {
    return {
      ok: false,
      verdict: verdict("config", "Config", "info", [
        { message: `no ${CONFIG_PATH} at head — ceiling and evidence checks skipped` },
      ]),
    };
  }
  const parsed = parseConfig(raw);
  if (!parsed.ok) {
    return {
      ok: false,
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
  return { ok: true, testRoots: parsed.value.testRoots };
}

async function implementationRules(
  facts: Facts,
  base: Oid,
  head: Oid,
  changes: readonly PathChange[],
): Promise<readonly RuleVerdict[]> {
  const binding = await validateBinding(facts, base, head, changes);
  if (!binding.ok) return [binding.verdict];
  const config = await loadConfig(facts, head);
  if (!config.ok) return [binding.verdict, config.verdict];
  return [
    binding.verdict,
    checkCeiling(binding.spec, changes, binding.flipPath, config.testRoots),
    checkEvidenceConsistency(binding.spec, changes, binding.flipPath, config.testRoots),
  ];
}

/**
 * A lone modified spec is ambiguous by paths alone: an amendment (stays
 * open — spec lane) or a flip-only delivery, the `exempt` mandate's exact
 * shape (routes to the implementation lane, where binding validates it).
 * Content disambiguates: head status `delivered` means flip.
 */
async function isFlipOnly(
  facts: Facts,
  head: Oid,
  changes: readonly PathChange[],
): Promise<boolean> {
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

  if (lane.lane === "spec") {
    if (await isFlipOnly(facts, head, changes)) {
      const routed = verdict("lane", "Lane: implementation", "pass", [
        { message: "flip-only change routed to the implementation lane" },
      ]);
      return collectVerdicts([routed, ...(await implementationRules(facts, base, head, changes))]);
    }
    return collectVerdicts([lane.verdict, await validateSpecLane(facts, head, changes)]);
  }
  if (lane.lane === "implementation") {
    return collectVerdicts([
      lane.verdict,
      ...(await implementationRules(facts, base, head, changes)),
    ]);
  }
  return collectVerdicts([lane.verdict]);
}
