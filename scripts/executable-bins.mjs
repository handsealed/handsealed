/**
 * tsc rewrites build outputs without the executable bit, so every rebuild
 * strips +x from bin entry points and workspace `.bin` links stop working.
 * This restores the bit on every workspace package's bin targets; a missing
 * target after a build is an error worth failing on, so ENOENT throws.
 */
import { chmodSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function makeBinsExecutable(root = ".") {
  const made = [];
  for (const dir of readdirSync(join(root, "packages"))) {
    const pkg = JSON.parse(readFileSync(join(root, "packages", dir, "package.json"), "utf8"));
    const bin = typeof pkg.bin === "string" ? { [pkg.name]: pkg.bin } : (pkg.bin ?? {});
    for (const target of Object.values(bin)) {
      const path = join(root, "packages", dir, target);
      chmodSync(path, 0o755);
      made.push(path);
    }
  }
  return made;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  for (const path of makeBinsExecutable()) {
    process.stdout.write(`+x ${path}\n`);
  }
}
