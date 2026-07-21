/**
 * The facts contract lives in its own root package so the engine and every
 * backend depend on it rather than on each other. Re-exported here so
 * engine's internal imports and public surface are unchanged.
 */
export type * from "@handsealed/facts";
