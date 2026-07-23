/**
 * Shared SSHSIG test fixtures, generated once with real OpenSSH
 * (`ssh-keygen -t ed25519`, then `ssh-keygen -Y sign -n <namespace> -f <key>
 * commitments.bin`) over the exact commitment bytes below. Ed25519 signing is
 * deterministic, so the constants are stable; they pin the parser and the
 * authorization rule to genuine ssh-keygen output. Test-only keys — no real
 * authority.
 */

import type { Spec } from "./spec.js";

export const FIXTURE_SLUG = "01abcdefgh2345-fixture-mandate";

/** A spec whose canonicalCommitments are exactly FIXTURE_COMMITMENTS. */
export const FIXTURE_SPEC: Spec = {
  status: "delivered",
  evidence: "additive",
  paths: ["packages/**"],
  outcome: "Fixture.",
  acceptance: ["Does the thing."],
};

export const FIXTURE_COMMITMENTS =
  "handsealed-authorization/v1\n" +
  `slug:${FIXTURE_SLUG}\n` +
  "evidence:additive\n" +
  "paths:packages/**\n" +
  "acceptance:Does the thing.";

export const FIXTURE_PUB1 =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKz7pBVK69P2bDUUj5yhqWmii9KyQnsqinZLelSPCcl0 handsealed-fixture";
export const FIXTURE_PUB2 =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG66vCiuQyYKkqseEsIAaerIwmoEw2Xq1TUVGKp+VP+t handsealed-stranger";

/** key1 over the commitments, namespace `handsealed` — the valid envelope. */
export const FIXTURE_SIG_GOOD = `-----BEGIN SSH SIGNATURE-----
U1NIU0lHAAAAAQAAADMAAAALc3NoLWVkMjU1MTkAAAAgrPukFUrr0/ZsNRSPnKGpaaKL0r
JCeyqKdkt6VI8JyXQAAAAKaGFuZHNlYWxlZAAAAAAAAAAGc2hhNTEyAAAAUwAAAAtzc2gt
ZWQyNTUxOQAAAEDU5xESb4sdh6IT2t2pIvW5toJH/DHUOdrX+kWtilSO3ueWn5XN9Jd0pP
gdoo7xG49f7oT24VFZYGTJwj4toHED
-----END SSH SIGNATURE-----
`;

/** key1 over the commitments, but namespace `file` — must never authorize. */
export const FIXTURE_SIG_WRONG_NAMESPACE = `-----BEGIN SSH SIGNATURE-----
U1NIU0lHAAAAAQAAADMAAAALc3NoLWVkMjU1MTkAAAAgrPukFUrr0/ZsNRSPnKGpaaKL0r
JCeyqKdkt6VI8JyXQAAAAEZmlsZQAAAAAAAAAGc2hhNTEyAAAAUwAAAAtzc2gtZWQyNTUx
OQAAAEBq4dN/D9vHt2GdVXcXqtPhGE95zO+fSHgDNAQnpVtAcJkH2p/yeEu9IJV/YTt+fK
4HfTXgMEy2qjVcUsW4CkkO
-----END SSH SIGNATURE-----
`;

/** key2 (not an allowed signer in the tests) over the same commitments. */
export const FIXTURE_SIG_STRANGER = `-----BEGIN SSH SIGNATURE-----
U1NIU0lHAAAAAQAAADMAAAALc3NoLWVkMjU1MTkAAAAgbrq8KK5DJgqSqx4SwgBp6sjCag
TDZerVNRUYqn5U/60AAAAKaGFuZHNlYWxlZAAAAAAAAAAGc2hhNTEyAAAAUwAAAAtzc2gt
ZWQyNTUxOQAAAEDMhpnZFKb3xbf+vd2ZdpE4/hYpCGZJEiDMNUEav/JOIr23aIuikPghj7
QZLeM9FZz3D77APdDLmEch7h1R6BcJ
-----END SSH SIGNATURE-----
`;

/** key1's OPENSSH private key — for tests that drive `ssh-keygen -Y sign`. */
export const FIXTURE_KEY1_PRIVATE = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACCs+6QVSuvT9mw1FI+coalpoovSskJ7Kop2S3pUjwnJdAAAAJhG+y4lRvsu
JQAAAAtzc2gtZWQyNTUxOQAAACCs+6QVSuvT9mw1FI+coalpoovSskJ7Kop2S3pUjwnJdA
AAAED07UUrtHMAv9uNV6SMIBF0O+DqFy20oDxE67pOe2oS76z7pBVK69P2bDUUj5yhqWmi
i9KyQnsqinZLelSPCcl0AAAAEmhhbmRzZWFsZWQtZml4dHVyZQECAw==
-----END OPENSSH PRIVATE KEY-----
`;
