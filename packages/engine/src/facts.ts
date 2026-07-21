/**
 * The Facts seam: everything the engine's rules may ask about a repository.
 *
 * There is exactly one production implementation (`@handsealed/facts-git`,
 * real git plumbing) shared by the CLI, self-hosted CI, and the hosted
 * service's sidecar. The engine itself never touches git.
 *
 * Error contract: implementations throw only on infrastructure failure
 * (unreachable repo, unknown object, git error). Callers treat any throw as
 * fail-closed — never as evidence of anything. Semantic absences are values:
 * a missing file is `null`, no merge base is `null`, an empty diff is `[]`.
 */

/** A full git object id (40-char SHA-1 or 64-char SHA-256, lowercase hex). */
export type Oid = string;

/** How a path changed between two trees. */
export type ChangeKind = "added" | "modified" | "deleted" | "renamed" | "copied" | "typechange";

export interface PathChange {
  /** The path after the change (the new path for renames/copies). */
  path: string;
  kind: ChangeKind;
  /** The old path, for renamed/copied entries. */
  fromPath?: string;
}

/** One file's slice of a unified diff. */
export interface FilePatch {
  path: string;
  fromPath?: string;
  kind: ChangeKind;
  /** Unified diff text for this file; empty for binary files. */
  text: string;
  binary: boolean;
}

/**
 * Stable identity of a diff's content, independent of line numbers and
 * context drift. Both sides of any comparison must come from the same
 * implementation — ids are never mixed across implementations.
 */
export interface PatchIdentity {
  /** One id over the whole diff. */
  combined: string;
  /** One id per changed file, keyed by post-change path. */
  files: Array<{ path: string; id: string }>;
}

/** A contiguous commit range, `base` exclusive, `head` inclusive. */
export interface CommitRange {
  base: Oid;
  head: Oid;
}

export type RangeDiffMarker = "equal" | "modified" | "only-in-old" | "only-in-new";

/** One pairing in a range-diff between two versions of a series. */
export interface RangeDiffEntry {
  marker: RangeDiffMarker;
  oldSubject?: string;
  newSubject?: string;
}

/** Whether merging `from` into `into` would be conflict-free. */
export interface MergeTreePreflight {
  clean: boolean;
  conflictedPaths: string[];
}

export interface Facts {
  /** Paths changed between two commits' trees, rename-aware. */
  pathsChanged(base: Oid, head: Oid): Promise<PathChange[]>;
  /** Full contents of `path` at `revision`, or `null` if absent there. */
  fileAtRef(revision: string, path: string): Promise<string | null>;
  /** Per-file unified diffs between two commits. */
  patchOf(base: Oid, head: Oid): Promise<FilePatch[]>;
  /** True when `ancestor` is an ancestor of (or equal to) `descendant`. */
  isAncestor(ancestor: Oid, descendant: Oid): Promise<boolean>;
  /** Best common ancestor, or `null` when histories are unrelated. */
  mergeBase(a: Oid, b: Oid): Promise<Oid | null>;
  /** Stable patch identity for the diff `base..head`. */
  patchIdOf(base: Oid, head: Oid): Promise<PatchIdentity>;
  /** Pairing of two series (e.g. pre- and post-rebase) by patch similarity. */
  rangeDiff(previous: CommitRange, current: CommitRange): Promise<RangeDiffEntry[]>;
  /** In-memory merge test: would merging `from` into `into` be clean? */
  mergeTreePreflight(into: Oid, from: Oid): Promise<MergeTreePreflight>;
}
