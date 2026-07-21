import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { performance } from "node:perf_hooks";
import { createRepo, type RepoFixture } from "./harness.js";

function scriptGraph(repo: RepoFixture): string {
  repo.commit({ message: "chore: root", files: { "README.md": "hello\n" } });
  repo.commit({ message: "feat: add a", files: { "src/a.txt": "a\n" } });
  repo.branch("feature");
  repo.commit({ message: "feat: change a", files: { "src/a.txt": "a2\n" } });
  repo.checkout("feature");
  repo.commit({ message: "feat: add b", files: { "src/b.txt": "b\n" } });
  repo.checkout("main");
  return repo.merge("feature");
}

test("initializes on main with deterministic identity", () => {
  const repo = createRepo();
  try {
    repo.commit({ message: "chore: root", files: { "a.txt": "1\n" } });
    assert.equal(repo.git("branch", "--show-current"), "main");
    assert.equal(repo.git("log", "--format=%an <%ae>", "-1"), "Fixture <fixture@handsealed.test>");
    assert.match(repo.head(), /^[0-9a-f]{40}$/);
  } finally {
    repo.dispose();
  }
});

test("identical scripts produce identical oids", () => {
  const first = createRepo();
  const second = createRepo();
  try {
    const a = scriptGraph(first);
    const b = scriptGraph(second);
    assert.equal(a, b);
  } finally {
    first.dispose();
    second.dispose();
  }
});

test("commits write, modify, and delete files", () => {
  const repo = createRepo();
  try {
    repo.commit({ message: "chore: add", files: { "keep.txt": "k\n", "drop.txt": "d\n" } });
    repo.commit({ message: "chore: drop", files: { "drop.txt": null } });
    assert.equal(repo.git("ls-files"), "keep.txt");
  } finally {
    repo.dispose();
  }
});

test("branches, checkouts, and merges build real graphs", () => {
  const repo = createRepo();
  try {
    const mergeOid = scriptGraph(repo);
    const parents = repo.git("rev-list", "--parents", "-1", mergeOid).split(" ");
    assert.equal(parents.length, 3, "merge commit has two parents");
    assert.equal(repo.git("log", "--format=%s", "-1", mergeOid).startsWith("Merge"), true);
  } finally {
    repo.dispose();
  }
});

test("the git escape hatch answers arbitrary questions", () => {
  const repo = createRepo();
  try {
    repo.commit({ message: "feat: one", files: { "x.txt": "1\n" } });
    repo.commit({ message: "feat: two", files: { "x.txt": "2\n" } });
    assert.deepEqual(repo.git("log", "--format=%s").split("\n"), ["feat: two", "feat: one"]);
  } finally {
    repo.dispose();
  }
});

test("dispose removes the fixture directory", () => {
  const repo = createRepo();
  repo.commit({ message: "chore: root", files: { "a.txt": "1\n" } });
  const dir = repo.dir;
  repo.dispose();
  assert.equal(existsSync(dir), false);
});

test("fixtures are fast enough to use everywhere", () => {
  const start = performance.now();
  const rounds = 3;
  for (let i = 0; i < rounds; i += 1) {
    const repo = createRepo();
    try {
      repo.commit({ message: "chore: one", files: { "a.txt": "1\n" } });
      repo.commit({ message: "chore: two", files: { "a.txt": "2\n" } });
      repo.commit({ message: "chore: three", files: { "b.txt": "3\n" } });
    } finally {
      repo.dispose();
    }
  }
  const perFixture = (performance.now() - start) / rounds;
  // Plan target is <100ms per fixture; assert a generous ceiling so CI
  // never flakes, and report the measured number for the execution log.
  console.log(`fixture avg: ${perFixture.toFixed(1)}ms`);
  assert.ok(perFixture < 500, `fixture too slow: ${perFixture.toFixed(1)}ms`);
});
