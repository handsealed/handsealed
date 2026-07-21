import { strict as assert } from "node:assert";
import { test } from "node:test";
import { caseNames, countsOf, parseResults } from "@handsealed/engine";
import handsealedReporter, { caseFromEvent, type ReporterEvent } from "./reporter.js";

const pass = (name: string, extra: Partial<ReporterEvent["data"]> = {}): ReporterEvent => ({
  type: "test:pass",
  data: { name, ...extra },
});

test("caseFromEvent maps events and filters non-cases", () => {
  assert.deepEqual(caseFromEvent(pass("a")), { name: "a", outcome: "pass" });
  assert.deepEqual(caseFromEvent({ type: "test:fail", data: { name: "b" } }), {
    name: "b",
    outcome: "fail",
  });
  assert.deepEqual(caseFromEvent(pass("c", { skip: true })), { name: "c", outcome: "skip" });
  assert.deepEqual(caseFromEvent(pass("d", { todo: "later" })), { name: "d", outcome: "skip" });
  assert.equal(caseFromEvent(pass("suite", { details: { type: "suite" } })), null);
  assert.equal(caseFromEvent({ type: "test:diagnostic", data: {} }), null);
});

test("the reporter emits a valid results file that the engine accepts end to end", async () => {
  const events: ReporterEvent[] = [
    pass("[01k0h3v8-do-thing#1] shows the delta"),
    pass("[01k0h3v8-do-thing#2] renders +0"),
    { type: "test:fail", data: { name: "unrelated failing case" } },
    pass("wrapper", { details: { type: "suite" } }),
  ];
  async function* source(): AsyncIterable<ReporterEvent> {
    yield* events;
  }
  const previous = process.env["HANDSEALED_SUITE"];
  process.env["HANDSEALED_SUITE"] = "scripts";
  try {
    let output = "";
    for await (const chunk of handsealedReporter(source())) output += chunk;
    const parsed = parseResults(output);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.suite, "scripts");
    assert.deepEqual(countsOf(parsed.value), { total: 3, pass: 2, fail: 1, skip: 0 });
    assert.equal(
      caseNames(parsed.value).some((n) => n.includes("#2")),
      true,
    );
  } finally {
    if (previous === undefined) delete process.env["HANDSEALED_SUITE"];
    else process.env["HANDSEALED_SUITE"] = previous;
  }
});
