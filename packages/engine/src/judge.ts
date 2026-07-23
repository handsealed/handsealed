import type { Facts, Oid, PathChange } from "@handsealed/facts";
import type { SuiteResults } from "./formats/results.js";
import { parseConfig, type AllowedSigner } from "./formats/config.js";
import { parseSpec, type Spec } from "./formats/spec.js";
import { extractMarkers, mapAcceptance } from "./rules/acceptance.js";
import { checkAuthorization } from "./rules/authorization.js";
import { validateBinding } from "./rules/binding.js";
import { reapprovalFact } from "./rules/reapproval.js";
import { checkCeiling } from "./rules/ceiling.js";
import { checkEvidenceConsistency } from "./rules/evidence.js";
import { checkExecution } from "./rules/execution.js";
import { checkRed } from "./rules/red.js";
import { matchesAny } from "./rules/glob.js";
import { SPECS_DIR, classifyLane } from "./rules/lane.js";
import { validateSpecLane } from "./rules/spec-lane.js";
import type { RuleVerdict, Verdicts } from "./rules/verdict.js";
import { collectVerdicts, verdict } from "./rules/verdict.js";

export const CONFIG_PATH = ".handsealed.yml";

type LoadedConfig =
  | {
      readonly ok: true;
      readonly testRoots: readonly string[];
      readonly allowedSigners: readonly AllowedSigner[];
      readonly exemptPaths: readonly string[];
      readonly redRequired: "off" | "additive";
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
    allowedSigners: parsed.value.allowedSigners ?? [],
    exemptPaths: parsed.value.exemptPaths ?? [],
    redRequired: parsed.value.redRequired ?? "off",
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

/**
 * One-shot deliveries are authorized by the signature alone, so authorization
 * is enforced fail-closed: no base config, no configured signers, or no valid
 * signature all refuse. Flips keep opt-in semantics (signers configured
 * enforce; none configured states so). The signature is read at base for a
 * flip (authorization precedes the work) and at head for a one-shot (the
 * mandate is created in the change — forging its signature requires the
 * owner's key either way).
 */
async function implementationRules(
  facts: Facts,
  base: Oid,
  head: Oid,
  changes: readonly PathChange[],
  config: LoadedConfig,
  results?: readonly SuiteResults[],
): Promise<readonly RuleVerdict[]> {
  const binding = await validateBinding(facts, base, head, changes);
  if (!binding.ok) return [binding.verdict];
  const oneshot = binding.mode === "oneshot";
  if (!config.ok) {
    const rules = [binding.verdict, config.verdict];
    if (oneshot) {
      rules.push(
        verdict("authorization", "Authorization", "fail", [
          { message: "one-shot delivery requires a base config with allowedSigners" },
        ]),
      );
    }
    return rules;
  }
  const rules: RuleVerdict[] = [binding.verdict];
  if (config.verdict !== null) rules.push(config.verdict);
  if (oneshot && config.allowedSigners.length === 0) {
    rules.push(
      verdict("authorization", "Authorization", "fail", [
        { message: "one-shot delivery requires configured allowedSigners at base" },
      ]),
    );
  } else {
    rules.push(
      await checkAuthorization(
        facts,
        oneshot ? head : base,
        binding.spec,
        binding.slug,
        config.allowedSigners,
      ),
    );
  }
  const sigPath = `${SPECS_DIR}${binding.slug}.sig`;
  const receiptPath = `${SPECS_DIR}${binding.slug}.red.json`;
  const judged = changes.filter((change) => change.path !== sigPath && change.path !== receiptPath);
  rules.push(
    checkCeiling(binding.spec, judged, binding.flipPath, config.testRoots, config.exemptPaths),
    checkEvidenceConsistency(
      binding.spec,
      judged,
      binding.flipPath,
      config.testRoots,
      config.exemptPaths,
    ),
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
  const red = await checkRed(
    facts,
    base,
    head,
    binding.spec,
    binding.slug,
    judged,
    config.testRoots,
    config.redRequired,
  );
  if (red !== null) rules.push(red);
  if (results !== undefined) {
    rules.push(checkExecution(binding.spec, binding.slug, results));
  }
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

export interface JudgeOptions {
  /** A previously approved head: the re-approval fact states what moved since. */
  readonly approved?: Oid;
  /** Attested suite results from the judged head: adds the execution rule. */
  readonly results?: readonly SuiteResults[];
}

async function laneRules(
  facts: Facts,
  base: Oid,
  head: Oid,
  changes: readonly PathChange[],
  config: LoadedConfig,
  results?: readonly SuiteResults[],
): Promise<readonly RuleVerdict[]> {
  const lane = classifyLane(changes, config.ok ? config.exemptPaths : []);
  if (lane.lane === "spec") {
    if (await isFlipOnly(facts, head, changes)) {
      const routed = verdict("lane", "Lane: implementation", "pass", [
        { message: "flip-only change routed to the implementation lane" },
      ]);
      return [routed, ...(await implementationRules(facts, base, head, changes, config, results))];
    }
    return [lane.verdict, await validateSpecLane(facts, base, head, changes)];
  }
  if (lane.lane === "implementation") {
    return [
      lane.verdict,
      ...(await implementationRules(facts, base, head, changes, config, results)),
    ];
  }
  return [lane.verdict];
}

/**
 * The offline judge: the static rule set over a base..head range — lane,
 * then per lane: spec validation, or binding + config + authorization +
 * ceiling + evidence + acceptance; with `approved`, the re-approval fact is
 * appended. This exact composition is what every surface replays; the CLI
 * and any hosted judge are thin shells over it.
 */
export async function judge(
  facts: Facts,
  base: Oid,
  head: Oid,
  options: JudgeOptions = {},
): Promise<Verdicts> {
  const changes = await facts.pathsChanged(base, head);
  const configTouched = changes.some(
    (change) => change.path === CONFIG_PATH || change.fromPath === CONFIG_PATH,
  );
  const config = await loadConfig(facts, base, configTouched);
  const rules = [...(await laneRules(facts, base, head, changes, config, options.results))];
  if (options.approved !== undefined) {
    rules.push(
      reapprovalFact(
        await facts.patchIdOf(base, options.approved),
        await facts.patchIdOf(base, head),
      ),
    );
  }
  return collectVerdicts(rules);
}
