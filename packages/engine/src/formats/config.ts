import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { Issue, ParseResult } from "./issues.js";
import { fail, issue, ok } from "./issues.js";

/** One test suite the customer's CI runs. */
export interface SuiteConfig {
  /** The command that runs the suite. */
  readonly run: string;
  /** Path the suite writes its structured result file to. */
  readonly results: string;
}

/** A code owner allowed to authorize mandates, by name and Ed25519 public key. */
export interface AllowedSigner {
  /** Human label reported in the authorization verdict. */
  readonly name: string;
  /** The signer's Ed25519 public key, base64 of the 32 raw bytes. */
  readonly key: string;
}

/** The `.handsealed.yml` contract. */
export interface HandsealedConfig {
  readonly version: 1;
  readonly suites: Readonly<Record<string, SuiteConfig>>;
  /** The per-runtime test-root manifest: files under these ride with head in evidence builds. */
  readonly testRoots: readonly string[];
  /** Files whose diffs earn the verification-surface badge. */
  readonly verificationSurface?: readonly string[];
  /** Code owners whose signature authorizes a mandate; omitted means not enforced. */
  readonly allowedSigners?: readonly AllowedSigner[];
}

const TOP_KEYS = new Set([
  "version",
  "suites",
  "testRoots",
  "verificationSurface",
  "allowedSigners",
]);
const SUITE_KEYS = new Set(["run", "results"]);
const SIGNER_KEYS = new Set(["name", "key"]);
export const SUITE_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export function parseConfig(source: string): ParseResult<HandsealedConfig> {
  const lineCounter = new LineCounter();
  const doc = parseDocument(source, { lineCounter });
  const issues: Issue[] = [];
  /** Position of any yaml node (or fallback 1:1); the single cast lives here. */
  const push = (message: string, node: unknown): void => {
    const range = (node as { range?: readonly [number, number, number] } | null | undefined)?.range;
    const pos = lineCounter.linePos(range?.[0] ?? 0);
    issues.push(issue(message, pos.line, pos.col));
  };

  for (const err of doc.errors) {
    const pos = lineCounter.linePos(err.pos[0] ?? 0);
    issues.push(issue(err.message, pos.line, pos.col));
  }
  if (issues.length > 0) return fail(issues);

  const root = doc.contents;
  if (!isMap(root)) {
    return fail([issue("config must be a YAML mapping", 1)]);
  }

  let version: number | undefined;
  const suites: Record<string, SuiteConfig> = {};
  let testRoots: string[] | undefined;
  let verificationSurface: string[] | undefined;
  let allowedSigners: AllowedSigner[] | undefined;

  const stringList = (node: unknown, name: string): string[] | undefined => {
    if (!isSeq(node)) {
      push(`"${name}" must be a list`, node);
      return undefined;
    }
    const values: string[] = [];
    for (const item of node.items) {
      if (isScalar(item) && typeof item.value === "string" && item.value.trim() !== "") {
        values.push(item.value);
      } else {
        push(`"${name}" entries must be non-empty strings`, item);
      }
    }
    if (values.length === 0) push(`"${name}" must not be empty`, node);
    return values;
  };

  const parseSigners = (node: unknown): AllowedSigner[] => {
    if (!isSeq(node)) {
      push('"allowedSigners" must be a list', node);
      return [];
    }
    const signers: AllowedSigner[] = [];
    for (const item of node.items) {
      if (!isMap(item)) {
        push("each allowedSigners entry must be a mapping with name and key", item);
        continue;
      }
      let name: string | undefined;
      let key: string | undefined;
      for (const field of item.items) {
        const fieldKey =
          isScalar(field.key) && typeof field.key.value === "string" ? field.key.value : undefined;
        if (fieldKey === undefined || !SIGNER_KEYS.has(fieldKey)) {
          push("signer entries take only name and key", field.key);
          continue;
        }
        const fieldValue = field.value;
        if (
          isScalar(fieldValue) &&
          typeof fieldValue.value === "string" &&
          fieldValue.value.trim() !== ""
        ) {
          if (fieldKey === "name") name = fieldValue.value;
          else key = fieldValue.value;
        } else {
          push(`signer "${fieldKey}" must be a non-empty string`, fieldValue ?? field.key);
        }
      }
      if (name === undefined) push('signer is missing "name"', item);
      if (key === undefined) push('signer is missing "key"', item);
      if (name !== undefined && key !== undefined) signers.push({ name, key });
    }
    if (signers.length === 0) push('"allowedSigners" must not be empty', node);
    return signers;
  };

  for (const pair of root.items) {
    const keyNode = pair.key;
    const key = isScalar(keyNode) && typeof keyNode.value === "string" ? keyNode.value : undefined;
    if (key === undefined || !TOP_KEYS.has(key)) {
      push(`unknown key "${String(isScalar(keyNode) ? keyNode.value : keyNode)}"`, keyNode);
      continue;
    }
    const valueNode = pair.value;
    if (key === "version") {
      if (isScalar(valueNode) && valueNode.value === 1) version = 1;
      else push('"version" must be 1', valueNode ?? keyNode);
    } else if (key === "suites") {
      if (!isMap(valueNode)) {
        push('"suites" must be a mapping of suite name to suite config', valueNode ?? keyNode);
        continue;
      }
      for (const suitePair of valueNode.items) {
        const nameNode = suitePair.key;
        const name =
          isScalar(nameNode) && typeof nameNode.value === "string" ? nameNode.value : undefined;
        if (name === undefined || !SUITE_NAME_RE.test(name)) {
          push("suite names must match [a-z0-9][a-z0-9-]*", nameNode);
          continue;
        }
        const suiteNode = suitePair.value;
        if (!isMap(suiteNode)) {
          push(`suite "${name}" must be a mapping`, suiteNode ?? nameNode);
          continue;
        }
        let run: string | undefined;
        let results: string | undefined;
        for (const fieldPair of suiteNode.items) {
          const fieldKeyNode = fieldPair.key;
          const fieldKey =
            isScalar(fieldKeyNode) && typeof fieldKeyNode.value === "string"
              ? fieldKeyNode.value
              : undefined;
          if (fieldKey === undefined || !SUITE_KEYS.has(fieldKey)) {
            push(`suite "${name}" has unknown key`, fieldKeyNode);
            continue;
          }
          const fieldValue = fieldPair.value;
          if (
            isScalar(fieldValue) &&
            typeof fieldValue.value === "string" &&
            fieldValue.value.trim() !== ""
          ) {
            if (fieldKey === "run") run = fieldValue.value;
            else results = fieldValue.value;
          } else {
            push(
              `suite "${name}" field "${fieldKey}" must be a non-empty string`,
              fieldValue ?? fieldKeyNode,
            );
          }
        }
        if (run === undefined) push(`suite "${name}" is missing "run"`, nameNode);
        if (results === undefined) push(`suite "${name}" is missing "results"`, nameNode);
        if (run !== undefined && results !== undefined) suites[name] = { run, results };
      }
      if (valueNode.items.length === 0) push('"suites" must not be empty', valueNode);
    } else if (key === "testRoots") {
      testRoots = stringList(valueNode, "testRoots");
    } else if (key === "allowedSigners") {
      allowedSigners = parseSigners(valueNode);
    } else {
      verificationSurface = stringList(valueNode, "verificationSurface");
    }
  }

  if (version === undefined && !issues.some((i) => i.message.includes('"version"'))) {
    issues.push(issue('missing required key "version"', 1));
  }
  if (Object.keys(suites).length === 0 && !issues.some((i) => i.message.includes("suite"))) {
    issues.push(issue('missing required key "suites"', 1));
  }
  if (testRoots === undefined && !issues.some((i) => i.message.includes("testRoots"))) {
    issues.push(issue('missing required key "testRoots"', 1));
  }

  if (issues.length > 0) return fail(issues);
  return ok({
    version: 1,
    suites,
    testRoots: testRoots ?? [],
    ...(verificationSurface !== undefined ? { verificationSurface } : {}),
    ...(allowedSigners !== undefined ? { allowedSigners } : {}),
  });
}
