/**
 * Real-git fixture harness: scripts throwaway repositories for tests.
 *
 * Fully deterministic — fixed author/committer identity and a per-repo
 * date counter mean that scripting the same graph twice yields identical
 * commit oids, everywhere, every run. All git invocations carry their own
 * environment, so ambient GIT_AUTHOR_ and GIT_COMMITTER_ variables can
 * never leak into fixtures.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Oid } from "@handsealed/facts";

const FIXTURE_EPOCH = 1_750_000_000;

export interface CommitOptions {
  message: string;
  /** Path → contents; `null` deletes the path. Omit for an empty commit. */
  files?: Record<string, string | null>;
}

export interface RepoFixture {
  /** Absolute path of the working directory. */
  dir: string;
  /** Run git in the fixture with the deterministic environment; returns trimmed stdout. */
  git(...args: string[]): string;
  /** Write/delete files, stage everything, commit. Returns the new head oid. */
  commit(options: CommitOptions): Oid;
  branch(name: string, at?: string): void;
  checkout(ref: string): void;
  /** Merge `ref` into the current branch (no fast-forward). Throws on conflict. */
  merge(ref: string): Oid;
  head(): Oid;
  /** Remove the fixture from disk. */
  dispose(): void;
}

export function createRepo(): RepoFixture {
  const dir = mkdtempSync(join(tmpdir(), "handsealed-fixture-"));
  let tick = 0;

  const env = (): NodeJS.ProcessEnv => {
    const date = `${FIXTURE_EPOCH + tick} +0000`;
    return {
      ...process.env,
      GIT_AUTHOR_NAME: "Fixture",
      GIT_AUTHOR_EMAIL: "fixture@handsealed.test",
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_NAME: "Fixture",
      GIT_COMMITTER_EMAIL: "fixture@handsealed.test",
      GIT_COMMITTER_DATE: date,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    };
  };

  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
      cwd: dir,
      env: env(),
      encoding: "utf8",
    }).trim();

  git("init", "-q", "-b", "main");

  const head = (): Oid => git("rev-parse", "HEAD");

  return {
    dir,
    git,
    head,
    commit(options: CommitOptions): Oid {
      for (const [path, contents] of Object.entries(options.files ?? {})) {
        const absolute = join(dir, path);
        if (contents === null) {
          rmSync(absolute, { force: true });
        } else {
          mkdirSync(dirname(absolute), { recursive: true });
          writeFileSync(absolute, contents);
        }
      }
      git("add", "-A");
      tick += 1;
      git("commit", "-q", "--allow-empty", "-m", options.message);
      return head();
    },
    branch(name: string, at?: string): void {
      git("branch", name, ...(at === undefined ? [] : [at]));
    },
    checkout(ref: string): void {
      git("checkout", "-q", ref);
    },
    merge(ref: string): Oid {
      tick += 1;
      git("merge", "-q", "--no-ff", "--no-edit", ref);
      return head();
    },
    dispose(): void {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}
