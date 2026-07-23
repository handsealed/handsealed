/**
 * The red receipt — `specs/<slug>.red.json` — the committed record that a
 * mandate's acceptance cases FAILED at a test-only checkpoint before the
 * implementation existed. It is a file (not a commit fact) for the same
 * reason the signature is: squash-merge garbage-collects the checkpoint
 * commit, and a receipt survives as the durable, offline-checkable record.
 * Only the marked failing cases belong here; full suite results stay out
 * of git.
 */

export interface RedCase {
  readonly name: string;
  readonly outcome: "fail";
}

export interface RedReceipt {
  readonly version: 1;
  readonly sha: string;
  readonly cases: readonly RedCase[];
}

export type RedReceiptParse =
  | { readonly ok: true; readonly receipt: RedReceipt }
  | { readonly ok: false; readonly issue: string };

const FULL_SHA = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;

export function parseRedReceipt(source: string): RedReceiptParse {
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    return { ok: false, issue: "receipt is not valid JSON" };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, issue: "receipt must be a JSON object" };
  }
  const record = data as Record<string, unknown>;
  if (record["version"] !== 1) {
    return { ok: false, issue: "receipt version must be 1" };
  }
  const sha = record["sha"];
  if (typeof sha !== "string" || !FULL_SHA.test(sha)) {
    return { ok: false, issue: "sha must be the full lowercase checkpoint commit hash" };
  }
  const rawCases = record["cases"];
  if (!Array.isArray(rawCases) || rawCases.length === 0) {
    return { ok: false, issue: "cases must be a non-empty array" };
  }
  const cases: RedCase[] = [];
  for (const entry of rawCases) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, issue: "every case must be an object with name and outcome" };
    }
    const name = (entry as Record<string, unknown>)["name"];
    const outcome = (entry as Record<string, unknown>)["outcome"];
    if (typeof name !== "string" || name.trim() === "") {
      return { ok: false, issue: "every case needs a non-empty name" };
    }
    if (outcome !== "fail") {
      return {
        ok: false,
        issue: `a red receipt records only failing cases; "${name}" is ${JSON.stringify(outcome)}`,
      };
    }
    cases.push({ name, outcome });
  }
  return { ok: true, receipt: { version: 1, sha, cases } };
}
