import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildNodeTestArgs } from "./results.js";

test("emit-node runs both reporters: human output stays, the file gets written", () => {
  const args = buildNodeTestArgs({ suite: "scripts", out: "r.json", paths: ["scripts/"] });
  assert.deepEqual(args, [
    "--test",
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    "--test-reporter=@handsealed/verifier/reporter",
    "--test-reporter-destination=r.json",
    "scripts/",
  ]);
});
