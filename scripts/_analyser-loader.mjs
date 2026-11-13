// Resolve the same public module URL in Node tests that browsers load natively.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('/mania-analyser/')) {
    return nextResolve(new URL(`../public${specifier}`, import.meta.url).href, context)
  }
  return nextResolve(specifier, context)
}
