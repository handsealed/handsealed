import { strict as assert } from "node:assert";
import { test } from "node:test";
import { memoryFacts } from "@handsealed/facts/memory";
import type { PathChange } from "@handsealed/facts";
import { FIXTURE_SIG_GOOD } from "../formats/sshsig.fixtures.js";
import { validateSpecLane } from "./spec-lane.js";

const factsWith = (files: Record<string, string>) => memoryFacts({ files });

const OPEN = `status: open\nevidence: additive\noutcome: Do the thing.\nacceptance:\n- It works.\n`;
const PATH = "specs/01k0h3v8-do-thing.md";
const added = (path: string, kind: PathChange["kind"] = "added"): PathChange => ({ path, kind });

test("valid open specs pass", async () => {
  const facts = factsWith({ [`h:${PATH}`]: OPEN });
  const result = await validateSpecLane(facts, "b", "h", [added(PATH)]);
  assert.equal(result.status, "pass");
});

test("adversarial: a spec-lane change may not deliver its own mandate", async () => {
  const facts = factsWith({ [`h:${PATH}`]: OPEN.replace("status: open", "status: delivered") });
  const result = await validateSpecLane(facts, "b", "h", [added(PATH)]);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /flips happen in implementation changes/);
});

test("adversarial: a delivered mandate is immutable — reopening it is refused", async () => {
  const facts = factsWith({
    [`b:${PATH}`]: OPEN.replace("status: open", "status: delivered"),
    [`h:${PATH}`]: OPEN,
  });
  const result = await validateSpecLane(facts, "b", "h", [added(PATH, "modified")]);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /immutable history/);
});

test("an amendment to a still-open mandate passes", async () => {
  const facts = factsWith({
    [`b:${PATH}`]: OPEN,
    [`h:${PATH}`]: OPEN.replace("Do the thing.", "Do the amended thing."),
  });
  const result = await validateSpecLane(facts, "b", "h", [added(PATH, "modified")]);
  assert.equal(result.status, "pass");
});

test("a signature companion alongside an open spec passes", async () => {
  const facts = factsWith({
    [`h:${PATH}`]: OPEN,
    "h:specs/01k0h3v8-do-thing.sig": FIXTURE_SIG_GOOD,
  });
  const result = await validateSpecLane(facts, "b", "h", [
    added(PATH),
    added("specs/01k0h3v8-do-thing.sig"),
  ]);
  assert.equal(result.status, "pass");
  assert.match(
    result.findings[0]?.message ?? "",
    /1 spec\(s\) valid and open; 1 signature companion/,
  );
});

test("adversarial: a signature companion that is not base64 fails", async () => {
  const facts = factsWith({
    [`h:${PATH}`]: OPEN,
    "h:specs/01k0h3v8-do-thing.sig": "not base64!!\n",
  });
  const result = await validateSpecLane(facts, "b", "h", [
    added(PATH),
    added("specs/01k0h3v8-do-thing.sig"),
  ]);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /SSH signature envelope/);
});

test("deletes, renames, bad filenames, and unparseable specs fail by name", async () => {
  const facts = factsWith({ [`h:specs/42-bad.md`]: OPEN, [`h:${PATH}`]: "garbage\n" });
  const result = await validateSpecLane(facts, "b", "h", [
    added("specs/01k0h3v9-old.md", "deleted"),
    added("specs/42-bad.md"),
    added(PATH, "modified"),
  ]);
  assert.equal(result.status, "fail");
  const messages = result.findings.map((f) => f.message);
  assert.equal(
    messages.some((m) => m.includes("never deleted")),
    true,
  );
  assert.equal(
    messages.some((m) => m.includes("invalid spec filename")),
    true,
  );
  assert.equal(
    messages.some((m) => m.includes("invalid spec:")),
    true,
  );
});

test("an SSHSIG envelope companion is welcome in the spec lane (pre-authorization)", async () => {
  const envelope = [
    "-----BEGIN SSH SIGNATURE-----",
    "U1NIU0lHAAAAAQAAADMAAAALc3NoLWVkMjU1MTkAAAAgrPukFUrr0/ZsNRSPnKGpaaKL0r",
    "JCeyqKdkt6VI8JyXQAAAAKaGFuZHNlYWxlZAAAAAAAAAAGc2hhNTEyAAAAUwAAAAtzc2gt",
    "ZWQyNTUxOQAAAEDU5xESb4sdh6IT2t2pIvW5toJH/DHUOdrX+kWtilSO3ueWn5XN9Jd0pP",
    "gdoo7xG49f7oT24VFZYGTJwj4toHED",
    "-----END SSH SIGNATURE-----",
    "",
  ].join("\n");
  const facts = factsWith({
    [`h:${PATH}`]: OPEN,
    "h:specs/01k0h3v8-do-thing.sig": envelope,
  });
  const result = await validateSpecLane(facts, "b", "h", [
    added(PATH),
    added("specs/01k0h3v8-do-thing.sig"),
  ]);
  assert.equal(result.status, "pass");
});

test("adversarial: a red receipt may not ride the spec lane", async () => {
  const facts = factsWith({ [`h:${PATH}`]: OPEN });
  const result = await validateSpecLane(facts, "b", "h", [
    added(PATH),
    added("specs/01k0h3v8-do-thing.red.json"),
  ]);
  assert.equal(result.status, "fail");
  assert.match(result.findings[0]?.message ?? "", /delivering implementation change/);
});
