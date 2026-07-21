/**
 * node:test reporter emitting the handsealed-results.json contract.
 *
 * Usage:
 *   HANDSEALED_SUITE=scripts node --test \
 *     --test-reporter=@handsealed/verifier/reporter \
 *     --test-reporter-destination=handsealed-results.json
 *
 * Suite name comes from HANDSEALED_SUITE (default "default"); the
 * destination flag makes node write the file itself.
 */

export interface ReporterEvent {
  type: string;
  data: {
    name?: string;
    skip?: boolean | string;
    todo?: boolean | string;
    details?: { type?: string };
  };
}

export interface EmittedCase {
  name: string;
  outcome: "pass" | "fail" | "skip";
}

/** Pure event mapping: suites are filtered; skip/todo read as skipped. */
export function caseFromEvent(event: ReporterEvent): EmittedCase | null {
  if (event.type !== "test:pass" && event.type !== "test:fail") return null;
  if (event.data.details?.type === "suite") return null;
  const name = event.data.name ?? "";
  if (event.type === "test:fail") return { name, outcome: "fail" };
  if (event.data.skip !== undefined && event.data.skip !== false) return { name, outcome: "skip" };
  if (event.data.todo !== undefined && event.data.todo !== false) return { name, outcome: "skip" };
  return { name, outcome: "pass" };
}

export function renderResults(suite: string, cases: readonly EmittedCase[]): string {
  return `${JSON.stringify({ version: 1, suite, cases }, null, 2)}\n`;
}

export default async function* handsealedReporter(
  source: AsyncIterable<ReporterEvent>,
): AsyncGenerator<string> {
  const cases: EmittedCase[] = [];
  for await (const event of source) {
    const emitted = caseFromEvent(event);
    if (emitted !== null) cases.push(emitted);
  }
  yield renderResults(process.env["HANDSEALED_SUITE"] ?? "default", cases);
}
