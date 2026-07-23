import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseSpec, type Spec } from "@handsealed/engine";
import { specSign } from "./spec-sign.js";

/** The conventional code-owner key location; `--key` overrides. */
export const DEFAULT_KEY_PATH = join(homedir(), ".handsealed", "key.pem");

export interface UnsignedMandate {
  readonly slug: string;
  readonly path: string;
  readonly spec: Spec;
}

/**
 * The unsigned mandates among candidate spec paths: every parseable
 * `specs/<slug>.md` without a sibling `.sig`. Pure — the caller supplies the
 * candidate list, a reader, and a sig-existence probe, so discovery is
 * testable without a repository.
 */
export function unsignedFrom(
  candidates: readonly string[],
  read: (path: string) => string | null,
  hasSignature: (sigPath: string) => boolean,
): UnsignedMandate[] {
  const mandates: UnsignedMandate[] = [];
  for (const path of candidates) {
    if (!path.endsWith(".md")) continue;
    const sigPath = `${path.slice(0, -".md".length)}.sig`;
    if (hasSignature(sigPath)) continue;
    const source = read(path);
    if (source === null) continue;
    const parsed = parseSpec(source);
    if (!parsed.ok) continue;
    const filename = path.slice(path.lastIndexOf("/") + 1);
    mandates.push({ slug: filename.slice(0, -".md".length), path, spec: parsed.value });
  }
  return mandates;
}

/**
 * What the code owner is about to sign, rendered for review: exactly the
 * commitments the signature covers (slug, evidence, paths, acceptance) plus
 * the status as context — with the reminder that status is never signed.
 */
export function renderCommitments(mandate: UnsignedMandate): string {
  const { slug, spec } = mandate;
  const lines = [
    `mandate: ${slug}`,
    `  status: ${spec.status} (status is context, never signed)`,
    `  evidence: ${spec.evidence}`,
    `  paths: ${(spec.paths ?? []).join(" ") || "(no ceiling)"}`,
    "  acceptance:",
    ...spec.acceptance.map((bullet) => `    - ${bullet}`),
  ];
  return lines.join("\n");
}

/**
 * Candidate spec paths from git: the specs changed between `base` and HEAD.
 * When the base ref does not resolve (fresh clone, unusual remote), fall
 * back to every tracked spec — discovery then over-reports and the unsigned
 * filter still narrows it.
 */
export function changedSpecPaths({ base = "origin/main", dir = "specs" } = {}): string[] {
  const lines = (output: string): string[] =>
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  try {
    return lines(
      execFileSync("git", ["diff", "--name-only", `${base}...HEAD`, "--", dir], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch {
    return lines(
      execFileSync("git", ["ls-files", dir], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  }
}

/** Sign every mandate with the code owner's key; returns the written .sig paths. */
export function signAll(
  mandates: readonly UnsignedMandate[],
  { keyPath, dir = "specs" }: { keyPath: string; dir?: string },
): string[] {
  return mandates.map((mandate) => specSign(mandate.slug, { dir, keyPath }));
}

/** Land the signatures on the branch: one commit, optionally pushed. */
export function commitAndPush(
  sigPaths: readonly string[],
  slugs: readonly string[],
  { push = false } = {},
): void {
  execFileSync("git", ["add", ...sigPaths], { stdio: "inherit" });
  execFileSync("git", ["commit", "-m", `chore: sign ${slugs.join(", ")}`], { stdio: "inherit" });
  if (push) {
    execFileSync("git", ["push"], { stdio: "inherit" });
  }
}

/** The key to sign with: explicit flag, else the conventional path. */
export function resolveKeyPath(
  explicit: string | undefined,
): { ok: true; path: string } | { ok: false; error: string } {
  const path = explicit ?? DEFAULT_KEY_PATH;
  if (!existsSync(path)) {
    return {
      ok: false,
      error:
        explicit === undefined
          ? `no signing key at ${DEFAULT_KEY_PATH} — place your key there (mkdir -p ~/.handsealed && mv <key> ~/.handsealed/key.pem) or pass --key <file>`
          : `no signing key at ${path}`,
    };
  }
  return { ok: true, path };
}
