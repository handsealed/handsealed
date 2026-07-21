/** The engine's package identity, used by consumers to assert version/provenance expectations. */
export const PACKAGE_NAME = "@handsealed/engine";

export type { Issue, ParseResult } from "./formats/issues.js";
export {
  EVIDENCE_CLASSES,
  SPEC_STATUSES,
  isValidSpecFilename,
  parseSpec,
  printSpec,
} from "./formats/spec.js";
export type { EvidenceClass, Spec, SpecStatus } from "./formats/spec.js";
export { SUITE_NAME_RE, parseConfig } from "./formats/config.js";
export type { HandsealedConfig, SuiteConfig } from "./formats/config.js";
export { cardinalityOf, caseNames, countsOf, parseResults } from "./formats/results.js";
export type { CaseOutcome, SuiteResults, TestCase } from "./formats/results.js";
export type {
  ChangeKind,
  CommitRange,
  Facts,
  FilePatch,
  MergeTreePreflight,
  Oid,
  PatchIdentity,
  PathChange,
  RangeDiffEntry,
  RangeDiffMarker,
} from "./facts.js";
export { SPECS_DIR, classifyLane } from "./rules/lane.js";
export type { Lane, LaneResult } from "./rules/lane.js";
export { validateBinding } from "./rules/binding.js";
export type { BindingResult } from "./rules/binding.js";
export { checkCeiling } from "./rules/ceiling.js";
export { checkEvidenceConsistency } from "./rules/evidence.js";
export { mapAcceptance } from "./rules/acceptance.js";
export { compareCardinality } from "./rules/cardinality.js";
export { reapprovalFact } from "./rules/reapproval.js";
export { checkRevert } from "./rules/revert.js";
export { globToRegExp, matchesAny, matchesPattern } from "./rules/glob.js";
export { collectVerdicts, renderMarkdown, verdict } from "./rules/verdict.js";
export type { Finding, RuleStatus, RuleVerdict, Verdicts } from "./rules/verdict.js";
