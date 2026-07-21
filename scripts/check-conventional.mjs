// Dependency-free conventional-commit check, run by CI.
// PRs: validates every non-merge commit subject in the range plus the PR title.
// Pushes: validates the head commit subject.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TYPES = "feat|fix|chore|docs|test|refactor|perf|build|ci|style|revert";
const PATTERN = new RegExp(`^(${TYPES})(\\([a-z0-9][a-z0-9-]*\\))?(!)?: \\S.*$`);

export function isConventional(subject) {
  return PATTERN.test(subject);
}

export function violations(subjects) {
  return subjects.filter((s) => !s.startsWith("Merge ") && !isConventional(s));
}

function gitSubjects(args) {
  const out = execFileSync("git", ["log", "--format=%s", ...args], { encoding: "utf8" });
  return out.split("\n").filter((line) => line.length > 0);
}

function main() {
  const event = process.env.GITHUB_EVENT_NAME ?? "";
  const subjects = [];
  if (event === "pull_request") {
    const base = process.env.BASE_SHA;
    const head = process.env.HEAD_SHA;
    if (!base || !head)
      throw new Error("BASE_SHA and HEAD_SHA are required for pull_request events");
    subjects.push(...gitSubjects([`${base}..${head}`]));
    const title = process.env.PR_TITLE;
    if (title) subjects.push(title);
  } else {
    subjects.push(...gitSubjects(["-1", "HEAD"]));
  }
  const bad = violations(subjects);
  if (bad.length > 0) {
    console.error("Non-conventional commit subjects:");
    for (const s of bad) console.error(`  x ${s}`);
    console.error(`Expected: type(scope)?: subject with type one of: ${TYPES}`);
    process.exit(1);
  }
  console.log(`ok - ${subjects.length} subject(s) conventional`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
