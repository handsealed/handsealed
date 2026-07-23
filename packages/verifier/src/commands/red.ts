/**
 * `handsealed red` — write the red receipt (`specs/<slug>.red.json`) from
 * the red run's suite results: only the cases carrying the mandate's
 * `[slug#n]` markers, all of which must have FAILED at the checkpoint (a
 * marked case that passed means the test does not demand the change — the
 * receipt refuses rather than attest a vacuous red).
 */

import type { RedReceipt, SuiteResults } from "@handsealed/engine";

const FULL_SHA = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;

export type RedBuild =
  | { readonly ok: true; readonly receipt: RedReceipt }
  | { readonly ok: false; readonly error: string };

/** Pure: filter the marked cases out of the red run's results. */
export function buildRedReceipt(
  slug: string,
  sha: string,
  results: readonly SuiteResults[],
): RedBuild {
  if (!FULL_SHA.test(sha)) {
    return { ok: false, error: "sha must be the full lowercase checkpoint commit hash" };
  }
  const marker = `[${slug}#`;
  const marked = results.flatMap((suite) => suite.cases.filter((c) => c.name.includes(marker)));
  if (marked.length === 0) {
    return { ok: false, error: `no case carries a "${marker}n]" marker in the given results` };
  }
  const passed = marked.filter((c) => c.outcome !== "fail");
  if (passed.length > 0) {
    return {
      ok: false,
      error:
        "marked case(s) did not fail at the checkpoint — the red proves nothing: " +
        passed.map((c) => c.name).join("; "),
    };
  }
  const byName = new Map(marked.map((c) => [c.name, { name: c.name, outcome: "fail" as const }]));
  return {
    ok: true,
    receipt: { version: 1, sha, cases: [...byName.values()] },
  };
}

export function renderRedReceipt(receipt: RedReceipt): string {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}
