import { strict as assert } from "node:assert";
import { statSync } from "node:fs";
import { test } from "node:test";
import { makeBinsExecutable } from "./executable-bins.mjs";

test("[01ky2zt4z52xsr-polish-the-delivery-surface#3] every workspace bin target is executable after a root build", () => {
  const made = makeBinsExecutable();
  assert.equal(made.length > 0, true, "no bin targets found");
  for (const path of made) {
    assert.equal((statSync(path).mode & 0o111) !== 0, true, `${path} is not executable`);
  }
});
