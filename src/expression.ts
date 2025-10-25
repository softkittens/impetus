import type { Scope } from './types';
import { unwrapExpr } from './utils';

const exprCache = new Map<string, Function>();
const computedCache = new WeakMap<Element, Map<string, { value: any; deps: Set<string> }>>();
const ctorCache = new Map<string, any>();

export function compile(expr: string): Function {
  let fn = exprCache.get(expr);
  if (!fn) {
    // Note: "with" is not allowed in strict mode. We intentionally avoid "use strict" here.
    // Provide $event as a parameter for event expressions.
    // eslint-disable-next-line no-new-func
    fn = new Function("state", "$event", `with(state){ return ( ${expr} ) }`);
    exprCache.set(expr, fn);
  }
  return fn;
}

export function evalInScope(expr: string, state: Scope, $event?: Event) {
  try {
    const fn = compile(expr);
    return fn(state, $event);
  } catch (e) {
    console.warn("impetus: eval error", expr, e);
    return undefined;
  }
}

export function evalComputed(expr: string, state: Scope, root: Element): any {
  let cache = computedCache.get(root);
  if (!cache) {
    cache = new Map();
    computedCache.set(root, cache);
  }
  const cached = cache.get(expr);
  if (cached !== undefined) return cached.value;
  const value = evalInScope(expr, state);
  cache.set(expr, { value, deps: new Set() });
  return value;
}

export function assignInScope(path: string, state: Scope, value: any) {
  try {
    const segments = String(path).split('.').map(s => s.trim()).filter(Boolean);
    if (!segments.length) return undefined;
    const first = segments[0] as PropertyKey;
    // Find the nearest owner in the prototype chain that defines the first segment
    let owner: any = state;
    let cur: any = state;
    while (cur && !Object.prototype.hasOwnProperty.call(cur, first)) {
      cur = Object.getPrototypeOf(cur);
    }
    if (cur) owner = cur;
    // Resolve target for nested assignment
    let target = owner;
    for (let i = 0; i < segments.length - 1; i++) {
      const k = segments[i] as any;
      if (target == null) return undefined;
      target = target[k];
    }
    const last = segments[segments.length - 1] as any;
    if (target == null) return undefined;
    target[last] = value;
    return value;
  } catch (e) {
    console.warn('impetus: assign error', path, e);
    return undefined;
  }
}

export function resolveCtor(name: string): any {
  const g = (globalThis as any)[name];
  if (typeof g === 'function') return g;
  if (ctorCache.has(name)) return ctorCache.get(name);
  try {
    const scripts = Array.from(document.querySelectorAll('script')) as HTMLScriptElement[];
    const code = scripts
      .filter(s => !s.type || s.type === 'text/javascript')
      .map(s => s.textContent || '')
      .join('\n');
    const found = new Function(
      'return (function(){\n' +
      code +
      `\n;try { return typeof ${name}==='function' ? ${name} : null } catch(_) { return null }\n})()`
    )();
    if (typeof found === 'function') {
      ctorCache.set(name, found);
      return found;
    }
  } catch {}
  return undefined;
}

export function invalidateComputedCache(root: Element): void {
  computedCache.delete(root);
}

// Test helpers
export function clearExpressionCache(): void {
  exprCache.clear();
  ctorCache.clear();
}

export function getExpressionCacheSize(): number {
  return exprCache.size;
}
