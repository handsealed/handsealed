/**
 * Minimal glob matching for scope ceilings and test roots. Supports `**`
 * (any depth), `*` (within a segment), `?` (one non-slash char). A pattern
 * with no glob characters matches as itself or as a directory prefix.
 */

const SPECIALS = /[.+^${}()|[\]\\]/g;

export function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i] ?? "";
    if (char === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          out += "(?:[^/]+/)*";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
    } else if (char === "?") {
      out += "[^/]";
    } else {
      out += char.replace(SPECIALS, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

/** Glob match when the pattern has glob characters; exact-or-prefix otherwise. */
export function matchesPattern(path: string, pattern: string): boolean {
  if (/[*?]/.test(pattern)) return globToRegExp(pattern).test(path);
  const prefix = pattern.endsWith("/") ? pattern : `${pattern}/`;
  return path === pattern || path.startsWith(prefix);
}

export function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesPattern(path, pattern));
}
