import type { Scope } from './types';
import { isPlainObject } from './utils';

const reactiveCache = new WeakMap<object, any>();
const reactiveProxies = new WeakSet<object>();
const proxyRoots = new WeakMap<object, Set<Element>>();

export class StateManager {
  private scheduled = new WeakSet<Element>();
  private rootStateMap = new WeakMap<Element, Scope>();
  private allRoots = new Set<Element>();
  private renderCallbacks = new Set<(state: Scope, root: Element) => void>();

  scheduleRender(root: Element): void {
    if (this.scheduled.has(root)) return;
    this.scheduled.add(root);
    queueMicrotask(() => {
      this.scheduled.delete(root);
      const state = this.rootStateMap.get(root);
      if (state) {
        // Call render callbacks with error handling
        this.renderCallbacks.forEach(callback => {
          try { callback(state, root); } 
          catch (e) { console.warn('impetus: render callback error', e); }
        });
        // Injected renderBindings for DOM updates
        (this as any).renderBindings?.(state, root);
      }
    });
  }

  // Core state methods
  setRootState(root: Element, state: Scope): void {
    this.rootStateMap.set(root, state);
  }

  getRootState(root: Element): Scope | undefined {
    return this.rootStateMap.get(root);
  }

  // Root management
  addRoot(root: Element): void {
    this.allRoots.add(root);
  }

  removeRoot(root: Element): void {
    this.allRoots.delete(root);
  }

  getAllRoots(): Element[] {
    return Array.from(this.allRoots);
  }

  // Initialization tracking
  isInitialized(root: Element): boolean {
    return this.scheduled.has(root) || this.rootStateMap.has(root);
  }

  markInitialized(root: Element): void {
    this.scheduled.add(root);
  }

  // Render callback management
  setRenderCallback(callback: (state: Scope, root: Element) => void): void {
    this.renderCallbacks.add(callback);
  }

  removeRenderCallback(callback: (state: Scope, root: Element) => void): void {
    this.renderCallbacks.delete(callback);
  }

  // Test helpers
  clear(): void {
    this.scheduled = new WeakSet();
    this.rootStateMap = new WeakMap();
    this.allRoots.clear();
    this.renderCallbacks.clear();
  }

  getRootCount(): number {
    return this.allRoots.size;
  }

  hasScheduledRender(root: Element): boolean {
    return this.scheduled.has(root);
  }
}

export const stateManager = new StateManager();

export function makeReactive<T extends object>(obj: T, root: Element, isRoot: boolean = false): T {
  if (obj === null || typeof obj !== "object") return obj;
  
  // If this is already one of our proxies, just register the root and return it
  if (reactiveProxies.has(obj as unknown as object)) {
    const roots = proxyRoots.get(obj as unknown as object) || new Set<Element>();
    roots.add(root);
    proxyRoots.set(obj as unknown as object, roots);
    return obj;
  }
  
  const existing = reactiveCache.get(obj as unknown as object);
  if (existing) {
    // Register this root as another view of the same proxy
    const roots = proxyRoots.get(existing) || new Set<Element>();
    roots.add(root);
    proxyRoots.set(existing, roots);
    return existing as T;
  }
  
  const proxy = new Proxy(obj as unknown as object, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      // Bind only root instance methods so `this` points at the proxy in templates
      if (isRoot && typeof val === 'function') {
        try { return val.bind(receiver); } catch { return val; }
      }
      // Recurse only into plain objects and arrays; leave other instances (Date, Map, DOM, etc.) intact
      if (val && typeof val === 'object') {
        // If this is already one of our reactive proxies, register this root
        if (reactiveProxies.has(val as unknown as object)) {
          const roots = proxyRoots.get(val as unknown as object) || new Set<Element>();
          roots.add(root);
          proxyRoots.set(val as unknown as object, roots);
          return val;
        }
        if (Array.isArray(val) || isPlainObject(val)) {
          return makeReactive(val as any, root, false);
        }
      }
      return val;
    },
    set(target, prop, value, receiver) {
      const res = Reflect.set(target, prop, value, receiver);
      const roots = proxyRoots.get(proxy) || new Set<Element>();
      if (roots.size === 0) roots.add(root);
      proxyRoots.set(proxy, roots);
      roots.forEach((r) => stateManager.scheduleRender(r));
      return res;
    },
    deleteProperty(target, prop) {
      const res = Reflect.deleteProperty(target, prop);
      const roots = proxyRoots.get(proxy) || new Set<Element>([root]);
      proxyRoots.set(proxy, roots);
      roots.forEach((r) => stateManager.scheduleRender(r));
      return res;
    },
  });
  
  reactiveCache.set(obj as unknown as object, proxy);
  reactiveProxies.add(proxy);
  // Register initial root
  proxyRoots.set(proxy, new Set<Element>([root]));
  return proxy as T;
}

// Test helpers
export function isReactiveProxy(obj: any): boolean {
  return reactiveProxies.has(obj);
}

export function getProxyRoots(proxy: object): Set<Element> {
  return proxyRoots.get(proxy) || new Set();
}
