/** A position-aware problem found while parsing or validating a format. */
export interface Issue {
  message: string;
  /** 1-based line. */
  line: number;
  /** 1-based column. */
  column: number;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

export function ok<T>(value: T): ParseResult<T> {
  return { ok: true, value };
}

export function fail<T>(issues: Issue[]): ParseResult<T> {
  return { ok: false, issues };
}

export function issue(message: string, line: number, column = 1): Issue {
  return { message, line, column };
}
