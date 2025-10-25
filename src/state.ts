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

/**
 * STATE MANAGER CLASS
 * 
 * This class manages all component state in the application
 * Think of it as the "brain" that remembers what data belongs to which component
 */
export class StateManager {
  private scheduled = new WeakSet<Element>();        // Components scheduled for re-render
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
        // WHY: This is injected from index.ts to avoid circular imports
        (this as any).renderBindings?.(state, root);
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
    this.allRoots.delete(root);
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
    return this.scheduled.has(root) || this.rootStateMap.has(root);
  }

  /**
   * Marks a component as initialized
   * @param root - The component's DOM element
   * 
   * WHY: Temporarily marks component as initialized during setup
   * This prevents race conditions during initialization
   */
  markInitialized(root: Element): void {
    this.scheduled.add(root);
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
    this.rootStateMap = new WeakMap();
    this.allRoots.clear();
    this.renderCallbacks.clear();
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
      const val = Reflect.get(target, prop, receiver);
      
      // Special handling for root component methods
      // WHY: We want 'this' to point to the proxy in component methods
      // This allows methods to access other reactive properties correctly
      if (isRoot && typeof val === 'function') {
        try { return val.bind(receiver); } catch { return val; }
      }
      
      // Recursively make nested objects reactive
      // WHY: If state.user.name changes, we want to detect that too
      // But only for plain objects and arrays, not special objects like Date, Map, etc.
      if (val && typeof val === 'object') {
        // If this is already one of our reactive proxies, register this root
        if (reactiveProxies.has(val as unknown as object)) {
          const roots = proxyRoots.get(val as unknown as object) || new Set<Element>();
          roots.add(root);
          proxyRoots.set(val as unknown as object, roots);
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
      // Actually set the property on the original object
      const res = Reflect.set(target, prop, value, receiver);
      
      // Get all components that use this object
      const roots = proxyRoots.get(proxy) || new Set<Element>();
      if (roots.size === 0) roots.add(root); // Fallback to current root
      proxyRoots.set(proxy, roots);
      
      // Schedule all affected components for re-render
      // WHY: Any component using this object needs to update its UI
      roots.forEach((r) => stateManager.scheduleRender(r));
      
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
      
      // Get all components that use this object
      const roots = proxyRoots.get(proxy) || new Set<Element>([root]);
      proxyRoots.set(proxy, roots);
      
      // Schedule all affected components for re-render
      // WHY: Deleting a property is also a change that should update the UI
      roots.forEach((r) => stateManager.scheduleRender(r));
      
      return res;
    },
  });
  
  // Store the proxy in our tracking systems
  reactiveCache.set(obj as unknown as object, proxy);
  reactiveProxies.add(proxy);
  proxyRoots.set(proxy, new Set<Element>([root]));
  
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
  return proxyRoots.get(proxy) || new Set();
}
