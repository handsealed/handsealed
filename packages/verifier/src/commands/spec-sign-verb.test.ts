import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const CLI = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));

test("[01ky7z90mezvrz-drop-the-unused-verification-surface-and-the-spec-sign-verb#2] the CLI no longer offers spec sign and points signing at the sign verb", () => {
  let status = 0;
  let stderr = "";
  try {
    execFileSync(process.execPath, [CLI, "spec", "sign", "01abcdefgh2345-x", "--key", "nope"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const failure = error as { status?: number; stderr?: string };
    status = failure.status ?? 0;
    stderr = String(failure.stderr ?? "");
  }
  assert.equal(status, 2);
  assert.match(stderr, /commands:/);
  assert.match(stderr, /^  sign /m);
  assert.ok(!/spec sign <slug>/.test(stderr), "usage must no longer advertise spec sign");
});
