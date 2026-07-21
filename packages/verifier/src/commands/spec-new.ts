import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz";

/** Sortable Crockford-base32 time prefix + entropy — never sequential. */
export function mintPrefix(nowMs: number, random: () => number = Math.random): string {
  let time = "";
  let remaining = nowMs;
  for (let i = 0; i < 10; i += 1) {
    time = (CROCKFORD[remaining % 32] ?? "0") + time;
    remaining = Math.floor(remaining / 32);
  }
  let entropy = "";
  for (let i = 0; i < 4; i += 1) {
    entropy += CROCKFORD[Math.floor(random() * 32)] ?? "0";
  }
  return `${time}${entropy}`;
}

export function slugify(words: readonly string[]): string {
  return words
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function renderSpecTemplate(): string {
  return [
    "status: open",
    "evidence: additive",
    "outcome: TODO — what changes and why, in one paragraph.",
    "acceptance:",
    "- TODO — an observable criterion.",
    "",
  ].join("\n");
}

export function specNew(
  words: readonly string[],
  options: { dir?: string; nowMs?: number } = {},
): string {
  const slug = slugify(words);
  if (slug === "")
    throw new Error("spec new needs a slug, e.g.: handsealed spec new match coin toast");
  const dir = options.dir ?? "specs";
  const filename = `${mintPrefix(options.nowMs ?? Date.now())}-${slug}.md`;
  const path = join(dir, filename);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderSpecTemplate(), { flag: "wx" });
  return path;
}
