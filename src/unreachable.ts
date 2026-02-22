/**
 * Invariant assertion for code paths that should never execute.
 *
 * Used in the AST builder and block helpers to guard against
 * "impossible" states — e.g. a grammar rule matched but an
 * expected token is missing from the CST. If this fires, it
 * indicates a bug in our grammar, not bad user input.
 *
 * Returns `never` so it works with `??`:
 *   const token = ctx.Foo?.[FIRST] ?? unreachable("...");
 */
export function unreachable(message: string): never {
  throw new Error(message);
}
