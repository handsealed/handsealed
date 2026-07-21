/**
 * `handsealed results emit-node` — run node:test with the handsealed
 * reporter attached alongside the human-facing spec reporter, so the
 * results file is written without losing normal test output.
 */
export interface EmitNodeOptions {
  suite: string;
  out: string;
  paths: readonly string[];
}

export function buildNodeTestArgs(options: EmitNodeOptions): string[] {
  return [
    "--test",
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    "--test-reporter=@handsealed/verifier/reporter",
    `--test-reporter-destination=${options.out}`,
    ...options.paths,
  ];
}
