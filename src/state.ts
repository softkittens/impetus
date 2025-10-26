/**
 * IMPETUS FRAMEWORK - State Management Module
 * 
 * This module handles the "reactive" part of the framework.
 * Reactive means when data changes, the UI automatically updates.
 * 
 * WHY THIS MODULE EXISTS:
 * - Manages component state (the data that drives the UI)
 * - Makes state reactive (changes trigger UI updates)
 * - Tracks which components use which data
 * - Prevents unnecessary re-renders for performance
 */

import type { Scope } from './types';
import { isPlainObject } from './utils';
import { getRenderBindings } from './runtime-api';

/**
 * WEAKMAPS FOR MEMORY MANAGEMENT
 * 
 * WHY: We use WeakMaps instead of regular Maps to prevent memory leaks
 * WeakMaps allow garbage collection when objects are no longer referenced
 * This is crucial for single-page apps where components come and go
 */
const reactiveCache = new WeakMap<object, any>();   // Cache of original object -> proxy
const reactiveProxies = new WeakSet<object>();     // Set of all proxy objects we've created
const proxyRoots = new WeakMap<object, Set<Element>>(); // Maps proxy -> set of DOM elements using it
// Cache of bound methods per proxy to avoid rebinding on every access
const methodBindCache = new WeakMap<object, WeakMap<Function, Function>>();

/**
 * LIGHTWEIGHT EFFECT SYSTEM
 * 
 * Tracks property-level dependencies for reactive targets and re-runs effects
 * when those properties change. This enables per-binding updates similar to
 * Alpine-style effects without introducing a VDOM.
 */
type EffectFn = () => void;
type DepMap = Map<PropertyKey, Set<Effect>>;
type TargetMap = WeakMap<object, DepMap>;
type Effect = { run: EffectFn; deps: Array<[object, PropertyKey]>; root: Element; stopped?: boolean };

const targetMap: TargetMap = new WeakMap();
let activeEffect: Effect | null = null;
let pending = new Set<Effect>();
let flushing = false;
const rootEffects = new WeakMap<Element, Set<Effect>>();

function track(target: object, key: PropertyKey) {
  if (!activeEffect) return;
  let deps = targetMap.get(target);
  if (!deps) {
    deps = new Map();
    targetMap.set(target, deps);
  }
  let dep = deps.get(key);
  if (!dep) {
    dep = new Set();
    deps.set(key, dep);
  }
  if (!dep.has(activeEffect)) {
    dep.add(activeEffect);
    activeEffect.deps.push([target, key]);
  }
}

function cleanup(effect: Effect) {
  for (const [t, k] of effect.deps) {
    const deps = targetMap.get(t);
    const dep = deps && deps.get(k);
    if (dep) dep.delete(effect);
  }
  effect.deps = [];
}

function schedule(effect: Effect) {
  if (effect.stopped) return;
  pending.add(effect);
  if (!flushing) {
    flushing = true;
    queueMicrotask(() => {
      try {
        pending.forEach(e => {
          cleanup(e);
          activeEffect = e;
          try { e.run(); } catch {}
          activeEffect = null;
        });
      } finally {
        pending.clear();
        flushing = false;
      }
    });
  }
}

function trigger(target: object, key: PropertyKey) {
  const deps = targetMap.get(target);
  const dep = deps && deps.get(key);
  if (!dep) return;
  dep.forEach(e => schedule(e));
}

export function registerEffect(fn: EffectFn, root: Element): { stop(): void } {
  const eff: Effect = { run: fn, deps: [], root };
  // track effects by root for cleanup
  let set = rootEffects.get(root);
  if (!set) { set = new Set(); rootEffects.set(root, set); }
  set.add(eff);
  // run once immediately to initialize
  cleanup(eff);
  activeEffect = eff;
  try { eff.run(); } finally { activeEffect = null; }
  return {
    stop() {
      eff.stopped = true;
      cleanup(eff);
      const rs = rootEffects.get(root);
      if (rs) rs.delete(eff);
    }
  };
}

export function stopEffectsForRoot(root: Element): void {
  const set = rootEffects.get(root);
  if (!set) return;
  set.forEach(e => { e.stopped = true; cleanup(e); });
  set.clear();
}

/**
 * STATE MANAGER CLASS
 * 
 * This class manages all component state in the application
 * Think of it as the "brain" that remembers what data belongs to which component
 */
export class StateManager {
  private scheduled = new WeakSet<Element>();        // Components scheduled for re-render
  private initMarks = new WeakSet<Element>();        // Components marked during initialization
  private rootStateMap = new WeakMap<Element, Scope>(); // Maps DOM element -> its state object
  private allRoots = new Set<Element>();             // All active component roots
  private renderCallbacks = new Set<(state: Scope, root: Element) => void>(); // Custom render callbacks

  /**
   * SCHEDULES A COMPONENT FOR RE-RENDERING
   * 
   * @param root - The component DOM element that needs to re-render
   * 
   * WHY: We don't want to re-render immediately every time data changes
   * That would be inefficient! Instead, we schedule renders for the next tick
   * This batches multiple changes into a single re-render
   */
  scheduleRender(root: Element): void {
    // Don't schedule the same component twice
    if (this.scheduled.has(root)) return;
    
    // Mark this component as needing a re-render
    this.scheduled.add(root);
    
    // Schedule the actual render for the next microtask
    // WHY: queueMicrotask runs after the current JavaScript execution finishes
    // This allows multiple state changes to be batched together
    queueMicrotask(() => {
      // Remove from scheduled set (we're rendering it now)
      this.scheduled.delete(root);
      
      // Get the component's state
      const state = this.rootStateMap.get(root);
      if (state) {
        // Call any custom render callbacks first
        // WHY: Allows other parts of the system to hook into renders
        this.renderCallbacks.forEach(callback => {
          try { callback(state, root); } 
          catch (e) { console.warn('impetus: render callback error', e); }
        });
        
        // Call the main render function to update the DOM
        // Obtain renderer via runtime-api to avoid direct circular import
        try {
          const renderer = getRenderBindings();
          renderer(state, root);
        } catch {}
      }
    });
  }

  /**
   * CORE STATE MANAGEMENT METHODS
   * 
   * These methods handle getting and setting component state
   */

  /**
   * Sets the state object for a component
   * @param root - The component's DOM element
   * @param state - The state object to associate with this component
   * 
   * WHY: We need to track which state belongs to which component
   * This allows us to find the right state when we need to re-render
   */
  setRootState(root: Element, state: Scope): void {
    this.rootStateMap.set(root, state);
    // Clear any temporary init mark now that the root has a state
    try { this.initMarks.delete(root); } catch {}
  }

  /**
   * Gets the state object for a component
   * @param root - The component's DOM element
   * @returns The component's state object or undefined
   * 
   * WHY: Allows other parts of the system to access component state
   * Used by devtools, render system, etc.
   */
  getRootState(root: Element): Scope | undefined {
    return this.rootStateMap.get(root);
  }

  /**
   * COMPONENT ROOT MANAGEMENT
   * 
   * These methods track which components exist in the application
   */

  /**
   * Registers a component root element
   * @param root - The component's DOM element
   * 
   * WHY: We need to know all active components for various operations
   * Like finding components for devtools or cleanup
   */
  addRoot(root: Element): void {
    this.allRoots.add(root);
  }

  /**
   * Unregisters a component root element
   * @param root - The component's DOM element
   * 
   * WHY: Clean up when components are destroyed
   * Prevents memory leaks and keeps the root list accurate
   */
  removeRoot(root: Element): void {
    // Cleanup all internal tracking for this root
    try { this.allRoots.delete(root); } catch {}
    try { this.rootStateMap.delete(root); } catch {}
    try { this.initMarks.delete(root); } catch {}
    try { this.scheduled.delete(root); } catch {}
  }

  /**
   * Gets all active component roots
   * @returns Array of all component DOM elements
   * 
   * WHY: Used by devtools to show all components
   * Also used for debugging and testing
   */
  getAllRoots(): Element[] {
    return Array.from(this.allRoots);
  }

  /**
   * INITIALIZATION TRACKING
   * 
   * These methods prevent double-initialization of components
   */

  /**
   * Checks if a component has been initialized
   * @param root - The component's DOM element
   * @returns True if component is initialized
   * 
   * WHY: Prevents setting up the same component multiple times
   * Double initialization would cause memory leaks and duplicate event listeners
   */
  isInitialized(root: Element): boolean {
    return this.initMarks.has(root) || this.rootStateMap.has(root);
  }

  /**
   * Marks a component as initialized
   * @param root - The component's DOM element
   * 
   * WHY: Temporarily marks component as initialized during setup
   * This prevents race conditions during initialization
   */
  markInitialized(root: Element): void {
    this.initMarks.add(root);
  }

  /**
   * RENDER CALLBACK MANAGEMENT
   * 
   * These methods allow other parts of the system to hook into renders
   */

  /**
   * Adds a custom render callback
   * @param callback - Function to call when a component renders
   * 
   * WHY: Allows devtools and other systems to monitor renders
   * Useful for debugging, analytics, or custom render logic
   */
  setRenderCallback(callback: (state: Scope, root: Element) => void): void {
    this.renderCallbacks.add(callback);
  }

  /**
   * Removes a custom render callback
   * @param callback - The callback function to remove
   * 
   * WHY: Clean up callbacks when they're no longer needed
   * Prevents memory leaks
   */
  removeRenderCallback(callback: (state: Scope, root: Element) => void): void {
    this.renderCallbacks.delete(callback);
  }

  /**
   * TESTING AND DEBUGGING HELPERS
   * 
   * These methods are primarily used in tests and debugging
   */

  /**
   * Clears all state (for testing)
   * 
   * WHY: Allows clean test isolation
   * Each test starts with a fresh state manager
   */
  clear(): void {
    this.scheduled = new WeakSet();
    this.initMarks = new WeakSet();
    this.rootStateMap = new WeakMap();
    this.allRoots = new Set();
    this.renderCallbacks = new Set();
  }

  /**
   * Gets the number of active components
   * @returns Count of registered component roots
   * 
   * WHY: Useful for testing and debugging
   */
  getRootCount(): number {
    return this.allRoots.size;
  }

  /**
   * Checks if a component is scheduled for render
   * @param root - The component's DOM element
   * @returns True if component is scheduled to re-render
   * 
   * WHY: Useful for testing render scheduling behavior
   */
  hasScheduledRender(root: Element): boolean {
    return this.scheduled.has(root);
  }
}

/**
 * GLOBAL STATE MANAGER INSTANCE
 * 
 * WHY: We use a singleton pattern so the entire app shares one state manager
 * This ensures all components are tracked in the same place
 */
export const stateManager = new StateManager();

/**
 * REACTIVE PROXY FACTORY FUNCTION
 * 
 * This is the magic function that makes objects reactive!
 * It creates a JavaScript Proxy that automatically triggers re-renders when changed.
 * 
 * @param obj - The object to make reactive
 * @param root - The component DOM element that uses this object
 * @param isRoot - Whether this is the root state object (special handling)
 * @returns A reactive proxy of the original object
 * 
 * WHY: JavaScript Proxies allow us to intercept object operations
 * When someone sets a property, we can trigger a re-render automatically
 */
export function makeReactive<T extends object>(obj: T, root: Element, isRoot: boolean = false): T {
  // Don't try to make primitives reactive
  if (obj === null || typeof obj !== "object") return obj;
  
  // If this is already one of our proxies, just register the root and return it
  // WHY: We don't want to create multiple proxies for the same object
  // That would cause confusion and memory issues
  if (reactiveProxies.has(obj as unknown as object)) {
    const roots = proxyRoots.get(obj as unknown as object) || new Set<Element>();
    roots.add(root);
    proxyRoots.set(obj as unknown as object, roots);
    return obj;
  }
  
  // Check if we already have a proxy for this object
  const existing = reactiveCache.get(obj as unknown as object);
  if (existing) {
    // Register this root as another view of the same proxy
    // WHY: Multiple components might share the same state object
    const roots = proxyRoots.get(existing) || new Set<Element>();
    roots.add(root);
    proxyRoots.set(existing, roots);
    return existing as T;
  }
  
  /**
   * CREATE THE REACTIVE PROXY
   * 
   * This is where the magic happens! The proxy intercepts all object operations.
   */
  const proxy = new Proxy(obj as unknown as object, {
    /**
     * GET TRAP - Called when someone reads a property
     * 
     * @param target - The original object
     * @param prop - The property name being accessed
     * @param receiver - The proxy object
     * @returns The property value (possibly made reactive)
     */
    get(target, prop, receiver) {
      // Track property access for active effects
      try { track(target as unknown as object, prop as PropertyKey); } catch {}
      const val = Reflect.get(target, prop, receiver);
      
      // Special handling for root component methods
      // WHY: Ensure methods are bound to the ROOT proxy even when accessed via prototype chain
      // (e.g., inside @each clones). This preserves `this` as the component state.
      if (isRoot && typeof val === 'function') {
        try {
          let cache = methodBindCache.get(proxy);
          if (!cache) { cache = new WeakMap<Function, Function>(); methodBindCache.set(proxy, cache); }
          const cached = cache.get(val);
          if (cached) return cached;
          const bound = (val as Function).bind(proxy);
          cache.set(val as Function, bound);
          return bound;
        } catch { return val; }
      }
      // Non-root proxies: bind to $root if present (root proxy), else bind to the accessing proxy (receiver)
      if (!isRoot && typeof val === 'function') {
        try {
          const rootRef = (target as any) && (target as any).$root;
          const bindTarget = (rootRef && reactiveProxies.has(rootRef as unknown as object)) ? rootRef : receiver;
          let cache = methodBindCache.get(bindTarget as unknown as object);
          if (!cache) { cache = new WeakMap<Function, Function>(); methodBindCache.set(bindTarget as unknown as object, cache); }
          const cached = cache.get(val as Function);
          if (cached) return cached;
          const bound = (val as Function).bind(bindTarget);
          cache.set(val as Function, bound);
          return bound;
        } catch { return val; }
      }
      
      // Recursively make nested objects reactive
      // WHY: If state.user.name changes, we want to detect that too
      // But only for plain objects and arrays, not special objects like Date, Map, etc.
      if (val && typeof val === 'object') {
        // If this is already one of our reactive proxies, register this root
        if (reactiveProxies.has(val as unknown as object)) {
          let roots = proxyRoots.get(val as unknown as object);
          if (!roots) {
            roots = new Set<any>();
            proxyRoots.set(val as unknown as object, roots);
          }
          try {
            roots.add(typeof WeakRef !== 'undefined' ? new WeakRef(root) : (root as any));
          } catch {
            roots.add(root as any);
          }
          return val;
        }
        
        // Only recurse into plain objects and arrays
        // WHY: We don't want to mess with Date, Map, Set, DOM elements, etc.
        if (Array.isArray(val) || isPlainObject(val)) {
          return makeReactive(val as any, root, false);
        }
      }
      
      return val;
    },
    
    /**
     * SET TRAP - Called when someone writes a property
     * 
     * @param target - The original object
     * @param prop - The property name being set
     * @param value - The new value
     * @param receiver - The proxy object
     * @returns True if the set was successful
     */
    set(target, prop, value, receiver) {
      // Skip scheduling if the value doesn't actually change
      const oldVal = Reflect.get(target, prop, receiver);
      if (Object.is(oldVal, value)) {
        return true;
      }
      // Ignore array length adjustments; index sets will schedule updates
      if (prop === 'length' && Array.isArray(target)) {
        return Reflect.set(target, prop, value, receiver);
      }
      // Actually set the property on the original object
      const res = Reflect.set(target, prop, value, receiver);
      // Trigger effects for this key
      try { trigger(target as unknown as object, prop as PropertyKey); } catch {}
      
      // Get all components that use this object
      let roots = proxyRoots.get(proxy);
      if (!roots) {
        roots = new Set<any>();
        proxyRoots.set(proxy, roots);
      }
      if (roots.size === 0) {
        try { roots.add(typeof WeakRef !== 'undefined' ? new WeakRef(root) : (root as any)); }
        catch { roots.add(root as any); }
      }
      
      // Schedule all affected components for re-render; drop dead WeakRefs
      roots.forEach((r: any) => {
        let el: Element | undefined;
        try { el = (r && typeof r.deref === 'function') ? r.deref() : (r as Element); }
        catch { el = r as Element; }
        if (el) stateManager.scheduleRender(el);
        else try { roots!.delete(r); } catch {}
      });
      
      return res;
    },
    
    /**
     * DELETE PROPERTY TRAP - Called when someone deletes a property
     * 
     * @param target - The original object
     * @param prop - The property name being deleted
     * @returns True if the delete was successful
     */
    deleteProperty(target, prop) {
      // Actually delete the property from the original object
      const res = Reflect.deleteProperty(target, prop);
      // Trigger effects for this key
      try { trigger(target as unknown as object, prop as PropertyKey); } catch {}
      
      // Get all components that use this object
      let roots = proxyRoots.get(proxy);
      if (!roots) {
        roots = new Set<any>();
        proxyRoots.set(proxy, roots);
      }
      if (roots.size === 0) {
        try { roots.add(typeof WeakRef !== 'undefined' ? new WeakRef(root) : (root as any)); }
        catch { roots.add(root as any); }
      }
      
      // Schedule all affected components for re-render; drop dead WeakRefs
      roots.forEach((r: any) => {
        let el: Element | undefined;
        try { el = (r && typeof r.deref === 'function') ? r.deref() : (r as Element); }
        catch { el = r as Element; }
        if (el) stateManager.scheduleRender(el);
        else try { roots!.delete(r); } catch {}
      });
      
      return res;
    },
  });
  
  // Store the proxy in our tracking systems
  reactiveCache.set(obj as unknown as object, proxy);
  reactiveProxies.add(proxy);
  try {
    const s = new Set<any>();
    s.add(typeof WeakRef !== 'undefined' ? new WeakRef(root) : (root as any));
    proxyRoots.set(proxy, s);
  } catch {
    proxyRoots.set(proxy, new Set<any>([root as any]));
  }
  
  return proxy as T;
}

/**
 * TESTING AND DEBUGGING HELPERS
 * 
 * These functions help with testing and debugging the reactive system
 */

/**
 * Checks if an object is a reactive proxy
 * @param obj - Object to check
 * @returns True if object is a reactive proxy
 * 
 * WHY: Useful for testing and debugging
 * Helps verify that objects are properly made reactive
 */
export function isReactiveProxy(obj: any): boolean {
  return reactiveProxies.has(obj);
}

/**
 * Gets all DOM elements that use a particular proxy
 * @param proxy - The reactive proxy object
 * @returns Set of DOM elements using this proxy
 * 
 * WHY: Useful for debugging and understanding data flow
 * Helps see which components are affected by state changes
 */
export function getProxyRoots(proxy: object): Set<Element> {
  const roots = proxyRoots.get(proxy);
  if (!roots) return new Set<Element>();
  const out = new Set<Element>();
  roots.forEach((r: any) => {
    let el: Element | undefined;
    try { el = (r && typeof r.deref === 'function') ? r.deref() : (r as Element); }
    catch { el = r as Element; }
    if (el) out.add(el);
    else {
      try { roots.delete(r); } catch {}
    }
  });
  return out;
}
