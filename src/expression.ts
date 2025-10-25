/**
 * IMPETUS FRAMEWORK - Expression Evaluation Module
 * 
 * This module handles evaluating JavaScript expressions in templates.
 * Expressions are things like {name + " " + age} or onclick="save()"
 * 
 * WHY THIS MODULE EXISTS:
 * - Safely evaluates expressions in component context
 * - Compiles expressions to functions for performance
 * - Handles computed properties with caching
 * - Resolves component classes from script tags
 */

import type { Scope } from './types';
import { unwrapExpr } from './utils';

/**
 * CACHING SYSTEMS
 * 
 * WHY: Compiling expressions is expensive, so we cache everything
 * This makes the framework fast even with many expressions
 */
const exprCache = new Map<string, Function>(); // Cache of expression string -> compiled function
const computedCache = new WeakMap<Element, Map<string, { value: any; deps: Set<string> }>>(); // Cache for computed properties per component
const ctorCache = new Map<string, any>(); // Cache of class name -> constructor function
let scriptContentCache: string | null = null; // Cache of all script tag contents

/**
 * EXPRESSION COMPILER
 * 
 * This function compiles a string expression into a JavaScript function
 * 
 * @param expr - The expression string to compile (like "name + ' ' + age")
 * @returns A function that evaluates the expression
 * 
 * WHY: Compiling once and reusing is much faster than evaluating with eval() every time
 * The compiled function can be called repeatedly with different state
 */
export function compile(expr: string): Function {
  // Check if we already compiled this expression
  let fn = exprCache.get(expr);
  if (!fn) {
    /**
     * CREATE THE COMPILED FUNCTION
     * 
     * We use new Function() instead of eval() for better performance and security
     * 
     * The "with" statement is NOT allowed in strict mode, so we intentionally avoid "use strict"
     * WHY: "with(state)" allows us to write "name" instead of "state.name" in templates
     * This makes templates much cleaner and more readable
     */
    // eslint-disable-next-line no-new-func
    fn = new Function("state", "$event", `with(state){ return ( ${expr} ) }`);
    
    // Cache the compiled function for future use
    exprCache.set(expr, fn);
  }
  return fn;
}

/**
 * EXPRESSION EVALUATOR
 * 
 * This function evaluates an expression in the context of component state
 * 
 * @param expr - The expression to evaluate
 * @param state - The component state object
 * @param $event - Optional event object (for event handlers)
 * @returns The result of the expression
 * 
 * WHY: This is the main function used throughout the framework to evaluate expressions
 * It handles errors gracefully and provides the component context
 */
export function evalInScope(expr: string, state: Scope, $event?: Event) {
  try {
    // Compile the expression (or get from cache) and execute it
    return compile(expr)(state, $event);
  } catch (e) {
    // If expression fails, warn and return undefined
    // WHY: We don't want broken expressions to crash the entire app
    console.warn("impetus: eval error", expr, e);
    return undefined;
  }
}

/**
 * COMPUTED PROPERTY EVALUATOR
 * 
 * This function evaluates computed properties with caching
 * Computed properties are expressions that depend on other state
 * 
 * @param expr - The computed property expression
 * @param state - The component state
 * @param root - The component DOM element
 * @returns The computed value
 * 
 * WHY: Computed properties can be expensive to calculate
 * We cache them so they're only recalculated when dependencies change
 */
export function evalComputed(expr: string, state: Scope, root: Element): any {
  // Get or create the cache for this component
  let cache = computedCache.get(root);
  if (!cache) {
    cache = new Map();
    computedCache.set(root, cache);
  }
  
  // Check if we already have a cached value
  const cached = cache.get(expr);
  if (cached !== undefined) return cached.value;
  
  // Calculate and cache the value
  const value = evalInScope(expr, state);
  cache.set(expr, { value, deps: new Set() });
  return value;
}

/**
 * PROPERTY ASSIGNMENT HELPER
 * 
 * This function assigns a value to a nested property path
 * 
 * @param path - The property path (like "user.profile.name")
 * @param state - The component state object
 * @param value - The value to assign
 * @returns The assigned value
 * 
 * WHY: We need to handle nested assignment like "user.name = 'John'"
 * This function navigates the object structure safely
 */
export function assignInScope(path: string, state: Scope, value: any) {
  try {
    // Split the path into segments: "user.profile.name" -> ["user", "profile", "name"]
    const segments = String(path).split('.').map(s => s.trim()).filter(Boolean);
    if (!segments.length) return undefined;
    
    const first = segments[0] as PropertyKey;
    
    /**
     * FIND THE RIGHT OBJECT TO MODIFY
     * 
     * We need to find the object that actually owns the property
     * This handles prototype chains correctly
     */
    let owner: any = state;
    let cur: any = state;
    
    // Walk up the prototype chain to find where the first property is defined
    while (cur && !Object.prototype.hasOwnProperty.call(cur, first)) {
      cur = Object.getPrototypeOf(cur);
    }
    if (cur) owner = cur;
    
    /**
     * NAVIGATE TO THE TARGET OBJECT
     * 
     * For "user.profile.name", we need to get to the "profile" object
     * Then we can set the "name" property on it
     */
    let target = owner;
    for (let i = 0; i < segments.length - 1; i++) {
      const k = segments[i] as any;
      if (target == null) return undefined;
      target = target[k];
    }
    
    // Set the final property
    const last = segments[segments.length - 1] as any;
    if (target == null) return undefined;
    target[last] = value;
    
    return value;
  } catch (e) {
    console.warn('impetus: assign error', path, e);
    return undefined;
  }
}

/**
 * CONSTRUCTOR RESOLVER
 * 
 * This function finds component constructor functions by name
 * 
 * @param name - The name of the constructor to find
 * @returns The constructor function or undefined
 * 
 * WHY: Components can be defined in script tags or global scope
 * This function searches both places to find the right constructor
 */
export function resolveCtor(name: string): any {
  // STEP 1: Check global scope first (fastest)
  const global = (globalThis as any)[name];
  if (typeof global === 'function') return global;
  
  // STEP 2: Check cache (second fastest)
  if (ctorCache.has(name)) return ctorCache.get(name);
  
  // STEP 3: Search in script tags (slower, but cached)
  try {
    // Build cache of all script contents if we haven't already
    if (scriptContentCache === null) {
      const scripts = Array.from(document.querySelectorAll('script')) as HTMLScriptElement[];
      scriptContentCache = scripts
        .filter(s => !s.type || s.type === 'text/javascript') // Only JavaScript scripts
        .map(s => s.textContent || '')
        .join('\n');
    }
    
    /**
     * SEARCH FOR THE CONSTRUCTOR IN SCRIPT CONTENTS
     * 
     * We create a function that evaluates all script contents
     * Then tries to return the constructor with the given name
     * 
     * WHY: This allows components to be defined in separate script tags
     * Without polluting the global scope
     */
    const found = new Function(
      'return (function(){\n' + scriptContentCache + 
      `\n;try { return typeof ${name}==='function' ? ${name} : null } catch(_) { return null }\n})()`
    )();
    
    if (typeof found === 'function') {
      ctorCache.set(name, found);
      return found;
    }
  } catch {} // Silently fail if script evaluation fails
  
  // Cache the undefined result to avoid repeated searches
  ctorCache.set(name, undefined);
  return undefined;
}

/**
 * CACHE INVALIDATION
 * 
 * This function clears the computed property cache for a component
 * 
 * @param root - The component DOM element
 * 
 * WHY: When state changes, computed properties might need to be recalculated
 * We clear the cache so they'll be recomputed on next access
 */
export function invalidateComputedCache(root: Element): void {
  computedCache.delete(root);
}

/**
 * TESTING AND DEBUGGING HELPERS
 * 
 * These functions help with testing and debugging the expression system
 */

/**
 * Clears all expression caches (for testing)
 * 
 * WHY: Allows clean test isolation
 * Each test starts with fresh caches
 */
export function clearExpressionCache(): void {
  exprCache.clear();
  // computedCache is a WeakMap and will be garbage collected automatically
  ctorCache.clear();
  scriptContentCache = null;
}

/**
 * Gets the size of the expression cache (for testing)
 * @returns Number of cached expressions
 * 
 * WHY: Useful for testing cache behavior and memory usage
 */
export function getExpressionCacheSize(): number {
  return exprCache.size;
}
