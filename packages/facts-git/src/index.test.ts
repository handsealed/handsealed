import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PACKAGE_NAME } from "./index.js";

test("facts-git package wires up", () => {
  assert.equal(PACKAGE_NAME, "@handsealed/facts-git");
});
