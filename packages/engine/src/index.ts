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
export { parseConfig } from "./formats/config.js";
export type { HandsealedConfig, SuiteConfig } from "./formats/config.js";
