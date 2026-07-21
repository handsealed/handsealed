import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PACKAGE_NAME } from "./index.js";

test("engine package wires up", () => {
  assert.equal(PACKAGE_NAME, "@handsealed/engine");
});
