import type { Facts, Oid, PathChange } from "@handsealed/facts";
import { parseConfig } from "./formats/config.js";
import { parseSpec, type Spec } from "./formats/spec.js";
import { extractMarkers, mapAcceptance } from "./rules/acceptance.js";
import { validateBinding } from "./rules/binding.js";
import { checkCeiling } from "./rules/ceiling.js";
import { checkEvidenceConsistency } from "./rules/evidence.js";
import { matchesAny } from "./rules/glob.js";
import { classifyLane } from "./rules/lane.js";
import { validateSpecLane } from "./rules/spec-lane.js";
import type { RuleVerdict, Verdicts } from "./rules/verdict.js";
import { collectVerdicts, verdict } from "./rules/verdict.js";

export const CONFIG_PATH = ".handsealed.yml";

type LoadedConfig =
  | {
      readonly ok: true;
      readonly testRoots: readonly string[];
      readonly verdict: RuleVerdict | null;
    }
  | { readonly ok: false; readonly verdict: RuleVerdict };

/**
 * The judging config is read at BASE: the rules that judge a change are the
 * ones it started under, so a change can never edit its own rulebook. A
 * config modified in the diff is flagged loudly and takes effect only after
 * it merges. (The evidence *runner* reads head's config — what to run is
 * head's business; what is allowed is base's.)
 */
async function loadConfig(facts: Facts, base: Oid, configTouched: boolean): Promise<LoadedConfig> {
  const raw = await facts.fileAtRef(base, CONFIG_PATH);
  if (raw === null) {
    const findings = [
      { message: `no ${CONFIG_PATH} at base — ceiling and evidence checks skipped` },
    ];
    if (configTouched) {
      findings.push({ message: "config introduced in this change — it takes effect after merge" });
    }
    return { ok: false, verdict: verdict("config", "Config", "info", findings) };
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
          message: `base config invalid: ${issue.message} (line ${issue.line})`,
          path: CONFIG_PATH,
        })),
      ),
    };
  }
  return {
    ok: true,
    testRoots: parsed.value.testRoots,
    verdict: configTouched
      ? verdict("config", "Config", "attention", [
          {
            message: "the verification config changed in this diff — judged with the base config",
            path: CONFIG_PATH,
          },
        ])
      : null,
  };
}

/** Additive mandates must claim every acceptance bullet in their changed test files. */
async function acceptanceRule(
  facts: Facts,
  head: Oid,
  spec: Spec,
  slug: string,
  changes: readonly PathChange[],
  testRoots: readonly string[],
): Promise<RuleVerdict | null> {
  if (spec.evidence !== "additive") return null;
  const markers: string[] = [];
  for (const change of changes) {
    if (change.kind === "deleted" || !matchesAny(change.path, testRoots)) continue;
    const content = await facts.fileAtRef(head, change.path);
    if (content !== null) markers.push(...extractMarkers(content));
  }
  return mapAcceptance(slug, spec.acceptance.length, markers);
}

async function implementationRules(
  facts: Facts,
  base: Oid,
  head: Oid,
  changes: readonly PathChange[],
): Promise<readonly RuleVerdict[]> {
  const binding = await validateBinding(facts, base, head, changes);
  if (!binding.ok) return [binding.verdict];
  const configTouched = changes.some(
    (change) => change.path === CONFIG_PATH || change.fromPath === CONFIG_PATH,
  );
  const config = await loadConfig(facts, base, configTouched);
  if (!config.ok) return [binding.verdict, config.verdict];
  const rules: RuleVerdict[] = [binding.verdict];
  if (config.verdict !== null) rules.push(config.verdict);
  rules.push(
    checkCeiling(binding.spec, changes, binding.flipPath, config.testRoots),
    checkEvidenceConsistency(binding.spec, changes, binding.flipPath, config.testRoots),
  );
  const acceptance = await acceptanceRule(
    facts,
    head,
    binding.spec,
    binding.slug,
    changes,
    config.testRoots,
  );
  if (acceptance !== null) rules.push(acceptance);
  return rules;
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
 * then per lane: spec validation, or binding + config + ceiling + evidence
 * + acceptance. This exact composition is what every surface replays;
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
    return collectVerdicts([lane.verdict, await validateSpecLane(facts, base, head, changes)]);
  }
  if (lane.lane === "implementation") {
    return collectVerdicts([
      lane.verdict,
      ...(await implementationRules(facts, base, head, changes)),
    ]);
  }
  return collectVerdicts([lane.verdict]);
}
