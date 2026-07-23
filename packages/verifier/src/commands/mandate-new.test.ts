import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isValidMandateFilename, parseMandate } from "@handsealed/engine";
import { mintPrefix, renderSpecTemplate, slugify, mandateNew } from "./mandate-new.js";

test("minted prefixes are sortable crockford and collision-resistant", () => {
  const a = mintPrefix(1_750_000_000_000, () => 0.1);
  const b = mintPrefix(1_750_000_000_001, () => 0.9);
  assert.match(a, /^[0-9abcdefghjkmnpqrstvwxyz]{14}$/);
  assert.ok(a < b, "later timestamps sort later");
  assert.notEqual(
    mintPrefix(1_750_000_000_000, () => 0.1),
    mintPrefix(1_750_000_000_000, () => 0.9),
  );
});

test("slugify normalizes words", () => {
  assert.equal(slugify(["Match", "Coin", "Toast!"]), "match-coin-toast");
  assert.equal(slugify(["  weird -- spacing  "]), "weird-spacing");
  assert.equal(slugify([]), "");
});

test("the template is a valid open mandate by construction", () => {
  const parsed = parseMandate(renderSpecTemplate());
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.status, "open");
  assert.equal(parsed.value.evidence, "additive");
});

test("mandateNew writes a validly named file and refuses to overwrite", () => {
  const dir = mkdtempSync(join(tmpdir(), "handsealed-specnew-"));
  try {
    const path = mandateNew(["match", "coin", "toast"], { dir, nowMs: 1_750_000_000_000 });
    assert.equal(existsSync(path), true);
    const filename = path.slice(path.lastIndexOf("/") + 1);
    assert.equal(isValidMandateFilename(filename), true);
    assert.equal(parseMandate(readFileSync(path, "utf8")).ok, true);
    assert.throws(() => mandateNew(["x"], { dir: path }), /EEXIST|ENOTDIR/);
    assert.throws(() => mandateNew([""], { dir }), /needs a slug/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
