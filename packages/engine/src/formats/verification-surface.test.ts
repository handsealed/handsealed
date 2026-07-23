import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseConfig } from "./config.js";

const CONFIG = `version: 1
suites:
  demo:
    run: npm test
    results: handsealed-results.json
testRoots:
  - tests
verificationSurface:
  - package.json
`;

test("[01ky7z90mezvrz-drop-the-unused-verification-surface-and-the-spec-sign-verb#1] the config parser refuses verificationSurface as an unknown key", () => {
  const parsed = parseConfig(CONFIG);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.ok(parsed.issues.some((issue) => issue.message.includes("verificationSurface")));
  }
});
