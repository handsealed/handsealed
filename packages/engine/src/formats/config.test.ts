import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseConfig } from "./config.js";

const VALID = `version: 1
suites:
  scripts:
    run: npm test
    results: handsealed-results.json
  backend:
    run: mise run backend:test
    results: tmp/results.json
testRoots:
  - packages/*/src
  - scripts
`;

test("parses a valid config", () => {
  const result = parseConfig(VALID);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.version, 1);
  assert.deepEqual(Object.keys(result.value.suites), ["scripts", "backend"]);
  assert.equal(result.value.suites["scripts"]?.run, "npm test");
  assert.deepEqual(result.value.testRoots, ["packages/*/src", "scripts"]);
});

test("parses allowedSigners", () => {
  const source = `${VALID}allowedSigners:\n  - name: zygimantas\n    key: aGVsbG8=\n`;
  const result = parseConfig(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.allowedSigners, [{ name: "zygimantas", key: "aGVsbG8=" }]);
});

test("allowedSigners is optional", () => {
  const result = parseConfig(VALID);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.allowedSigners, undefined);
});

const INVALID: Array<{ name: string; source: string; expect: string; line?: number }> = [
  { name: "not a mapping", source: "- a\n- b\n", expect: "must be a YAML mapping" },
  {
    name: "missing version",
    source: VALID.replace("version: 1\n", ""),
    expect: 'missing required key "version"',
  },
  {
    name: "wrong version",
    source: VALID.replace("version: 1", "version: 2"),
    expect: '"version" must be 1',
    line: 1,
  },
  { name: "unknown top key", source: `${VALID}extra: nope\n`, expect: 'unknown key "extra"' },
  {
    name: "signer missing key",
    source: `${VALID}allowedSigners:\n  - name: a\n`,
    expect: 'signer is missing "key"',
  },
  {
    name: "signer missing name",
    source: `${VALID}allowedSigners:\n  - key: aGVsbG8=\n`,
    expect: 'signer is missing "name"',
  },
  {
    name: "allowedSigners not a list",
    source: `${VALID}allowedSigners: nope\n`,
    expect: '"allowedSigners" must be a list',
  },
  {
    name: "empty allowedSigners",
    source: `${VALID}allowedSigners: []\n`,
    expect: '"allowedSigners" must not be empty',
  },
  {
    name: "suites not a map",
    source: VALID.replace(/suites:[\s\S]*?testRoots:/, "suites: none\ntestRoots:"),
    expect: '"suites" must be a mapping',
  },
  {
    name: "bad suite name",
    source: VALID.replace("  scripts:", "  Scripts_1:"),
    expect: "suite names must match",
  },
  {
    name: "suite missing run",
    source: VALID.replace("    run: npm test\n", ""),
    expect: 'suite "scripts" is missing "run"',
  },
  {
    name: "suite missing results",
    source: VALID.replace("    results: handsealed-results.json\n", ""),
    expect: 'suite "scripts" is missing "results"',
  },
  {
    name: "suite unknown key",
    source: VALID.replace("    run: npm test", "    run: npm test\n    timeout: 5"),
    expect: 'suite "scripts" has unknown key',
  },
  {
    name: "suite empty field",
    source: VALID.replace("run: npm test", 'run: ""'),
    expect: '"run" must be a non-empty string',
  },
  {
    name: "testRoots not a list",
    source: VALID.replace(/testRoots:\n(  - .*\n)+/, "testRoots: everywhere\n"),
    expect: '"testRoots" must be a list',
  },
  {
    name: "testRoots empty entry",
    source: VALID.replace("  - scripts", '  - ""'),
    expect: '"testRoots" entries must be non-empty strings',
  },
  {
    name: "missing testRoots",
    source: VALID.replace(/testRoots:\n(  - [^\n]*\n)+/, ""),
    expect: 'missing required key "testRoots"',
  },
  {
    name: "duplicate keys",
    source: `version: 1\nversion: 1\n${VALID.split("\n").slice(1).join("\n")}`,
    expect: "unique",
  },
  { name: "yaml syntax error", source: "version: [unclosed\n", expect: "" },
];

for (const fixture of INVALID) {
  test(`rejects: ${fixture.name}`, () => {
    const result = parseConfig(fixture.source);
    assert.equal(result.ok, false, "expected failure");
    if (result.ok) return;
    assert.ok(result.issues.length > 0);
    if (fixture.expect !== "") {
      const hit = result.issues.find((i) => i.message.includes(fixture.expect));
      assert.notEqual(
        hit,
        undefined,
        `no issue matching "${fixture.expect}" in: ${result.issues.map((i) => i.message).join(" | ")}`,
      );
      if (fixture.line !== undefined && hit !== undefined) assert.equal(hit.line, fixture.line);
    }
  });
}

test("issues carry positions", () => {
  const result = parseConfig(VALID.replace("version: 1", "version: 2"));
  assert.equal(result.ok, false);
  if (result.ok) return;
  const first = result.issues[0];
  assert.notEqual(first, undefined);
  assert.equal(first?.line, 1);
  assert.ok((first?.column ?? 0) >= 1);
});

test("redRequired accepts off and additive, refuses anything else, and defaults absent", () => {
  const additive = parseConfig(`${VALID}redRequired: additive\n`);
  assert.equal(additive.ok, true);
  if (additive.ok) assert.equal(additive.value.redRequired, "additive");
  const off = parseConfig(`${VALID}redRequired: off\n`);
  assert.equal(off.ok, true);
  if (off.ok) assert.equal(off.value.redRequired, "off");
  const invalid = parseConfig(`${VALID}redRequired: sometimes\n`);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.ok(invalid.issues.some((i) => i.message.includes("redRequired")));
  const absent = parseConfig(VALID);
  assert.equal(absent.ok, true);
  if (absent.ok) assert.equal(absent.value.redRequired, undefined);
});
