import type { Finding, RuleVerdict } from "./verdict.js";
import { verdict } from "./verdict.js";

const TITLE = "Acceptance map";
const MARKER = /\[([0-9abcdefghjkmnpqrstvwxyz]{8,26}-[a-z0-9-]+)#(\d+)\]/g;

/**
 * Tests claim the acceptance bullet they cover by carrying a marker in
 * their name: `[<spec-slug>#<bullet-number>]` (1-based). Totality both ways:
 * every bullet claimed by at least one test, every claim pointing at a real
 * bullet. Mapping is structure, not proof — whether a test honestly covers
 * its bullet stays review territory.
 */
export function mapAcceptance(
  slug: string,
  acceptanceCount: number,
  testNames: readonly string[],
): RuleVerdict {
  const claims = new Map<number, number>();
  const findings: Finding[] = [];
  for (const name of testNames) {
    for (const match of name.matchAll(MARKER)) {
      if (match[1] !== slug) continue;
      const bullet = Number(match[2]);
      if (bullet < 1 || bullet > acceptanceCount) {
        findings.push({ message: `test claims nonexistent bullet #${bullet}: ${name}` });
        continue;
      }
      claims.set(bullet, (claims.get(bullet) ?? 0) + 1);
    }
  }
  for (let bullet = 1; bullet <= acceptanceCount; bullet += 1) {
    if (!claims.has(bullet)) {
      findings.push({ message: `acceptance bullet #${bullet} is unclaimed by any test` });
    }
  }
  if (findings.length > 0) {
    return verdict("acceptance", TITLE, "fail", findings);
  }
  return verdict("acceptance", TITLE, "pass", [
    {
      message: `all ${acceptanceCount} bullet(s) claimed (${[...claims.values()].reduce((a, b) => a + b, 0)} claim(s) total)`,
    },
  ]);
}
