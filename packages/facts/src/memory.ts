import type {
  Facts,
  FilePatch,
  MergeTreePreflight,
  Oid,
  PatchIdentity,
  PathChange,
  RangeDiffEntry,
} from "./index.js";

/**
 * An in-memory Facts double for tests and playgrounds. Configure only the
 * questions a given test asks; any unconfigured method throws when called,
 * matching the contract's "throw = infrastructure failure" rule.
 *
 * Range-keyed tables use the key `${base}..${head}`.
 */
export interface MemoryFactsConfig {
  /** File contents keyed by `${revision}:${path}`; absent keys read as `null`. */
  readonly files?: Readonly<Record<string, string>>;
  /** Changes for every range (an array) or per range (keyed by `${base}..${head}`). */
  readonly changes?: readonly PathChange[] | Readonly<Record<string, readonly PathChange[]>>;
  /** Patch identities keyed by `${base}..${head}`. */
  readonly patchIds?: Readonly<Record<string, PatchIdentity>>;
  readonly patches?: Readonly<Record<string, readonly FilePatch[]>>;
  readonly isAncestor?: (ancestor: Oid, descendant: Oid) => boolean;
  readonly mergeBase?: (a: Oid, b: Oid) => Oid | null;
  readonly rangeDiffs?: Readonly<Record<string, readonly RangeDiffEntry[]>>;
  readonly mergeTreePreflights?: Readonly<Record<string, MergeTreePreflight>>;
}

const key = (base: Oid, head: Oid): string => `${base}..${head}`;

const require_ = <T>(
  table: Readonly<Record<string, T>> | undefined,
  k: string,
  method: string,
): T => {
  const value = table?.[k];
  if (value === undefined) throw new Error(`memoryFacts: ${method}(${k}) was not configured`);
  return value;
};

export function memoryFacts(config: MemoryFactsConfig = {}): Facts {
  return {
    async pathsChanged(base, head) {
      const changes = config.changes;
      if (changes === undefined) throw new Error("memoryFacts: pathsChanged was not configured");
      if (Array.isArray(changes)) return changes;
      return require_(
        changes as Readonly<Record<string, readonly PathChange[]>>,
        key(base, head),
        "pathsChanged",
      );
    },
    async fileAtRef(revision, path) {
      return config.files?.[`${revision}:${path}`] ?? null;
    },
    async patchOf(base, head) {
      return require_(config.patches, key(base, head), "patchOf");
    },
    async isAncestor(ancestor, descendant) {
      if (config.isAncestor === undefined)
        throw new Error("memoryFacts: isAncestor was not configured");
      return config.isAncestor(ancestor, descendant);
    },
    async mergeBase(a, b) {
      if (config.mergeBase === undefined)
        throw new Error("memoryFacts: mergeBase was not configured");
      return config.mergeBase(a, b);
    },
    async patchIdOf(base, head) {
      return require_(config.patchIds, key(base, head), "patchIdOf");
    },
    async rangeDiff(previous, current) {
      return require_(
        config.rangeDiffs,
        `${key(previous.base, previous.head)} ${key(current.base, current.head)}`,
        "rangeDiff",
      );
    },
    async mergeTreePreflight(into, from) {
      return require_(config.mergeTreePreflights, key(into, from), "mergeTreePreflight");
    },
  };
}
