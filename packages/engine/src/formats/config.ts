import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { Issue, ParseResult } from "./issues.js";
import { fail, issue, ok } from "./issues.js";

/** One test suite the customer's CI runs. */
export interface SuiteConfig {
  /** The command that runs the suite. */
  run: string;
  /** Path the suite writes its structured result file to. */
  results: string;
}

/** The `.handsealed.yml` contract. */
export interface HandsealedConfig {
  version: 1;
  suites: Record<string, SuiteConfig>;
  /** The per-runtime test-root manifest: files under these ride with head in evidence builds. */
  testRoots: string[];
  /** Files whose diffs earn the verification-surface badge. */
  verificationSurface?: string[];
}

const TOP_KEYS = new Set(["version", "suites", "testRoots", "verificationSurface"]);
const SUITE_KEYS = new Set(["run", "results"]);
export const SUITE_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

interface Positioned {
  range?: [number, number, number] | null | undefined;
}

export function parseConfig(source: string): ParseResult<HandsealedConfig> {
  const lineCounter = new LineCounter();
  const doc = parseDocument(source, { lineCounter });
  const issues: Issue[] = [];
  const at = (node: Positioned | null | undefined): { line: number; column: number } => {
    const offset = node?.range?.[0] ?? 0;
    const pos = lineCounter.linePos(offset);
    return { line: pos.line, column: pos.col };
  };
  const push = (message: string, node: Positioned | null | undefined): void => {
    const pos = at(node);
    issues.push(issue(message, pos.line, pos.column));
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

  const stringList = (node: unknown, name: string): string[] | undefined => {
    if (!isSeq(node)) {
      push(`"${name}" must be a list`, node as Positioned);
      return undefined;
    }
    const values: string[] = [];
    for (const item of node.items) {
      if (isScalar(item) && typeof item.value === "string" && item.value.trim() !== "") {
        values.push(item.value);
      } else {
        push(`"${name}" entries must be non-empty strings`, item as Positioned);
      }
    }
    if (values.length === 0) push(`"${name}" must not be empty`, node);
    return values;
  };

  for (const pair of root.items) {
    const keyNode = pair.key;
    const key = isScalar(keyNode) && typeof keyNode.value === "string" ? keyNode.value : undefined;
    if (key === undefined || !TOP_KEYS.has(key)) {
      push(
        `unknown key "${String(isScalar(keyNode) ? keyNode.value : keyNode)}"`,
        keyNode as Positioned,
      );
      continue;
    }
    const valueNode = pair.value;
    if (key === "version") {
      if (isScalar(valueNode) && valueNode.value === 1) version = 1;
      else push('"version" must be 1', (valueNode ?? keyNode) as Positioned);
    } else if (key === "suites") {
      if (!isMap(valueNode)) {
        push(
          '"suites" must be a mapping of suite name to suite config',
          (valueNode ?? keyNode) as Positioned,
        );
        continue;
      }
      for (const suitePair of valueNode.items) {
        const nameNode = suitePair.key;
        const name =
          isScalar(nameNode) && typeof nameNode.value === "string" ? nameNode.value : undefined;
        if (name === undefined || !SUITE_NAME_RE.test(name)) {
          push("suite names must match [a-z0-9][a-z0-9-]*", nameNode as Positioned);
          continue;
        }
        const suiteNode = suitePair.value;
        if (!isMap(suiteNode)) {
          push(`suite "${name}" must be a mapping`, (suiteNode ?? nameNode) as Positioned);
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
            push(`suite "${name}" has unknown key`, fieldKeyNode as Positioned);
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
              (fieldValue ?? fieldKeyNode) as Positioned,
            );
          }
        }
        if (run === undefined) push(`suite "${name}" is missing "run"`, nameNode as Positioned);
        if (results === undefined)
          push(`suite "${name}" is missing "results"`, nameNode as Positioned);
        if (run !== undefined && results !== undefined) suites[name] = { run, results };
      }
      if (valueNode.items.length === 0) push('"suites" must not be empty', valueNode);
    } else if (key === "testRoots") {
      testRoots = stringList(valueNode, "testRoots");
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
  const config: HandsealedConfig = {
    version: 1,
    suites,
    testRoots: testRoots ?? [],
  };
  if (verificationSurface !== undefined) config.verificationSurface = verificationSurface;
  return ok(config);
}
