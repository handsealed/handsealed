/** A position-aware problem found while parsing or validating a format. */
export interface Issue {
  readonly message: string;
  /** 1-based line. */
  readonly line: number;
  /** 1-based column. */
  readonly column: number;
}

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly Issue[] };

export function ok<T>(value: T): ParseResult<T> {
  return { ok: true, value };
}

export function fail<T>(issues: readonly Issue[]): ParseResult<T> {
  return { ok: false, issues };
}

export function issue(message: string, line: number, column = 1): Issue {
  return { message, line, column };
}

/** Type guard over a literal list — narrows instead of casting. */
export function isOneOf<const T extends readonly string[]>(
  values: T,
  candidate: string,
): candidate is T[number] {
  return (values as readonly string[]).includes(candidate);
}
