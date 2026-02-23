/**
 * Throws unconditionally, typed as `never` so TypeScript
 * treats call sites as unreachable.
 *
 * A bare `throw` inside a `??` or ternary expression does
 * not satisfy the type-checker — only a call whose return
 * type is `never` does. Wrapping the throw here gives us
 * that property without extra boilerplate at every site:
 *
 *   const token = ctx.Foo?.[FIRST] ?? unreachable(
 *     "Foo token missing after grammar matched FooRule"
 *   );
 *
 * Used throughout the AST builder and block helpers to
 * guard against "impossible" states: a grammar rule
 * matched but an expected token is absent from the CST.
 * If this fires it indicates a bug in our grammar or AST
 * builder, not bad user input.
 * @param message - A description of the violated
 *   invariant, including enough context (rule name, token
 *   kind, surrounding state) to diagnose the bug without
 *   a debugger.
 */
export function unreachable(message: string): never {
  throw new Error(message);
}
