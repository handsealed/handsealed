/**
 * The single production Facts implementation: real git plumbing over
 * `execFile`, bare-clone-compatible (tree-level commands only, no working
 * tree or index assumptions), `--end-of-options` before every revision.
 *
 * Known v1 limitation, deliberate: paths containing the literal sequence
 * " b/" inside `diff --git` headers are not disambiguated.
 */
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import type {
  ChangeKind,
  CommitRange,
  Facts,
  FilePatch,
  MergeTreePreflight,
  Oid,
  PatchFileId,
  PatchIdentity,
  PathChange,
  RangeDiffEntry,
  RangeDiffMarker,
} from "@handsealed/facts";

const execFileP = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;

const exitCode = (error: unknown): number | undefined => {
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : undefined;
};

const stdoutOf = (error: unknown): string => {
  const out = (error as { stdout?: unknown }).stdout;
  return typeof out === "string" ? out : "";
};

const KINDS: Record<string, ChangeKind> = {
  A: "added",
  M: "modified",
  D: "deleted",
  T: "typechange",
};

function parseNameStatus(raw: string): PathChange[] {
  const tokens = raw.split("\0").filter((t) => t.length > 0);
  const changes: PathChange[] = [];
  let i = 0;
  while (i < tokens.length) {
    const status = tokens[i];
    i += 1;
    if (status === undefined) break;
    const letter = status[0] ?? "";
    if (letter === "R" || letter === "C") {
      const fromPath = tokens[i];
      const path = tokens[i + 1];
      i += 2;
      if (fromPath === undefined || path === undefined) {
        throw new Error(`malformed rename/copy entry in name-status output`);
      }
      changes.push({ path, fromPath, kind: letter === "R" ? "renamed" : "copied" });
    } else {
      const path = tokens[i];
      i += 1;
      const kind = KINDS[letter];
      if (path === undefined || kind === undefined) {
        throw new Error(`unsupported change status "${status}"`);
      }
      changes.push({ path, kind });
    }
  }
  return changes;
}

function splitPatchText(raw: string): string[] {
  const start = raw.indexOf("diff --git ");
  if (start < 0) return [];
  return raw
    .slice(start)
    .split(/\n(?=diff --git )/)
    .map((chunk) => (chunk.endsWith("\n") ? chunk : `${chunk}\n`));
}

const HEADER = /^diff --git (?:"a\/(?:.+)"|a\/(?:.+)) (?:"b\/(?<quoted>.+)"|b\/(?<plain>.+))$/;

function chunkPath(chunk: string): string {
  const firstLine = chunk.slice(0, chunk.indexOf("\n"));
  const groups = HEADER.exec(firstLine)?.groups;
  const path = groups?.["quoted"] ?? groups?.["plain"];
  if (path === undefined) throw new Error(`unparseable patch header: ${firstLine}`);
  return path;
}

const isBinaryChunk = (chunk: string): boolean =>
  chunk.includes("\nBinary files ") || chunk.includes("\nGIT binary patch");

const RANGE_LINE =
  /^\s*(?:\d+|-+):\s+\S+\s+(?<marker>[=!<>])\s+(?:\d+|-+):\s+\S+(?:\s+(?<subject>.*))?$/;
const MARKERS: Record<string, RangeDiffMarker> = {
  "=": "equal",
  "!": "modified",
  "<": "only-in-old",
  ">": "only-in-new",
};

export function createGitFacts(repoDir: string): Facts {
  const run = async (...args: string[]): Promise<string> => {
    const { stdout } = await execFileP("git", ["-C", repoDir, ...args], {
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
    });
    return stdout;
  };

  const runWithInput = (args: string[], input: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const child = spawn("git", ["-C", repoDir, ...args], { stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (d: string) => {
        out += d;
      });
      child.stderr.on("data", (d: string) => {
        err += d;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(out);
        else reject(new Error(`git ${args.join(" ")} exited ${code}: ${err}`));
      });
      child.stdin.end(input);
    });

  const patchText = (base: Oid, head: Oid): Promise<string> =>
    run("diff-tree", "-r", "-p", "-M", "-C", "--no-color", "--end-of-options", base, head);

  const patchIdFor = async (text: string): Promise<string> => {
    const out = await runWithInput(["patch-id", "--stable"], text);
    const first = out.split("\n", 1)[0] ?? "";
    const id = first.split(" ", 1)[0] ?? "";
    return id;
  };

  const pathsChanged = async (base: Oid, head: Oid): Promise<PathChange[]> => {
    const raw = await run(
      "diff-tree",
      "-r",
      "-z",
      "--name-status",
      "-M",
      "-C",
      "--end-of-options",
      base,
      head,
    );
    return parseNameStatus(raw);
  };

  return {
    pathsChanged,

    async fileAtRef(revision: string, path: string): Promise<string | null> {
      const spec = `${revision}:${path}`;
      let type: string;
      try {
        type = (await run("cat-file", "-t", "--end-of-options", spec)).trim();
      } catch {
        return null;
      }
      if (type !== "blob") return null;
      return run("cat-file", "blob", "--end-of-options", spec);
    },

    async patchOf(base: Oid, head: Oid): Promise<FilePatch[]> {
      const [changes, raw] = await Promise.all([pathsChanged(base, head), patchText(base, head)]);
      const byPath = new Map(changes.map((c) => [c.path, c]));
      return splitPatchText(raw).map((chunk): FilePatch => {
        const path = chunkPath(chunk);
        const change = byPath.get(path);
        const binary = isBinaryChunk(chunk);
        return {
          path,
          kind: change?.kind ?? "modified",
          text: binary ? "" : chunk,
          binary,
          ...(change?.fromPath !== undefined ? { fromPath: change.fromPath } : {}),
        };
      });
    },

    async isAncestor(ancestor: Oid, descendant: Oid): Promise<boolean> {
      try {
        await run("merge-base", "--is-ancestor", "--end-of-options", ancestor, descendant);
        return true;
      } catch (error) {
        if (exitCode(error) === 1) return false;
        throw error;
      }
    },

    async mergeBase(a: Oid, b: Oid): Promise<Oid | null> {
      try {
        return (await run("merge-base", "--end-of-options", a, b)).trim();
      } catch (error) {
        if (exitCode(error) === 1) return null;
        throw error;
      }
    },

    async patchIdOf(base: Oid, head: Oid): Promise<PatchIdentity> {
      const raw = await patchText(base, head);
      const chunks = splitPatchText(raw);
      const combined = await patchIdFor(raw);
      const files: PatchFileId[] = [];
      for (const chunk of chunks) {
        const id = await patchIdFor(chunk);
        files.push({
          path: chunkPath(chunk),
          // patch-id yields nothing for hunk-less chunks (binary, mode-only).
          // Fall back to hashing the chunk so distinct content never compares
          // equal — erring toward "changed" is the safe direction.
          id: id !== "" ? id : `sha256:${createHash("sha256").update(chunk).digest("hex")}`,
        });
      }
      return { combined, files };
    },

    async rangeDiff(previous: CommitRange, current: CommitRange): Promise<RangeDiffEntry[]> {
      const raw = await run(
        "range-diff",
        "--no-color",
        "--end-of-options",
        `${previous.base}..${previous.head}`,
        `${current.base}..${current.head}`,
      );
      const entries: RangeDiffEntry[] = [];
      for (const line of raw.split("\n")) {
        const groups = RANGE_LINE.exec(line)?.groups;
        if (groups === undefined) continue;
        const marker = MARKERS[groups["marker"] ?? ""];
        if (marker === undefined) continue;
        const subject = (groups["subject"] ?? "").trim();
        entries.push({
          marker,
          ...(subject !== "" && marker === "only-in-old" ? { oldSubject: subject } : {}),
          ...(subject !== "" && marker !== "only-in-old" ? { newSubject: subject } : {}),
        });
      }
      return entries;
    },

    async mergeTreePreflight(into: Oid, from: Oid): Promise<MergeTreePreflight> {
      try {
        await run(
          "merge-tree",
          "--write-tree",
          "--name-only",
          "--no-messages",
          "--end-of-options",
          into,
          from,
        );
        return { clean: true, conflictedPaths: [] };
      } catch (error) {
        if (exitCode(error) === 1) {
          const lines = stdoutOf(error)
            .split("\n")
            .filter((l) => l.length > 0);
          return { clean: false, conflictedPaths: lines.slice(1) };
        }
        throw error;
      }
    },
  };
}
