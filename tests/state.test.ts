/**
 * Tests for state management in the Impetus framework
 * 
 * This test suite verifies that the StateManager and reactive proxy system
 * work correctly. State management is the core of the framework's reactivity,
 * enabling automatic UI updates when state changes.
 * 
 * The tests cover:
 * - StateManager root and state management
 * - Render scheduling and callback handling
 * - Reactive proxy creation and behavior
 * - Nested object reactivity
 * - Array mutation handling
 * - Proxy utility functions
 */

import { expect, test, describe, beforeEach, afterEach, spyOn, flushMicrotasks } from "./setup";
import { StateManager, makeReactive, isReactiveProxy, getProxyRoots, stateManager } from "../src/state";

describe("State", () => {
  let localStateManager: StateManager;
  let mockElement: any;

  /**
   * Set up a fresh StateManager and mock element for each test
   * 
   * This ensures tests don't interfere with each other
   * and start with a clean state.
   */
  beforeEach(() => {
    localStateManager = new StateManager();
    mockElement = document.createElement("div");
  });

  let consoleWarnSpy: any;

  /**
   * Set up console spy before each test
   * 
   * This allows us to verify that warning messages are logged
   * when errors occur in render callbacks.
   */
  beforeEach(() => {
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });

  /**
   * Restore console spy after each test
   * 
   * This cleans up after the test and prevents
   * interference with other tests.
   */
  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe("root management", () => {
    /**
     * Test adding and removing root elements
     * 
     * The StateManager should track root elements and
     * allow adding/removing them correctly.
     */
    test("adds and removes roots", () => {
      expect(localStateManager.getRootCount()).toBe(0);
      
      localStateManager.addRoot(mockElement);
      expect(localStateManager.getRootCount()).toBe(1);
      expect(localStateManager.getAllRoots()).toContain(mockElement);
      
      localStateManager.removeRoot(mockElement);
      expect(localStateManager.getRootCount()).toBe(0);
      expect(localStateManager.getAllRoots()).not.toContain(mockElement);
    });

    /**
     * Test retrieving all root elements
     * 
     * Should return a list of all registered root elements.
     */
    test("gets all roots", () => {
      const element1 = document.createElement("div");
      const element2 = document.createElement("span");
      
      localStateManager.addRoot(element1);
      localStateManager.addRoot(element2);
      
      const roots = localStateManager.getAllRoots();
      expect(roots).toHaveLength(2);
      expect(roots).toContain(element1);
      expect(roots).toContain(element2);
    });
  });

  describe("state management", () => {
    /**
     * Test setting and getting root state
     * 
     * The StateManager should store and retrieve
     * state objects for each root element.
     */
    test("sets and gets root state", () => {
      const state = { count: 5, name: "test" };
      
      localStateManager.setRootState(mockElement, state);
      expect(localStateManager.getRootState(mockElement)).toBe(state);
    });

    /**
     * Test handling of non-existent state
     * 
     * Should return undefined when no state is set
     * for a given root element.
     */
    test("returns undefined for non-existent state", () => {
      expect(localStateManager.getRootState(mockElement)).toBeUndefined();
    });
  });

  describe("initialization tracking", () => {
    /**
     * Test initialization status tracking
     * 
     * The StateManager should track whether a root
     * has been initialized and schedule render accordingly.
     */
    test("tracks initialization status", () => {
      expect(localStateManager.isInitialized(mockElement)).toBe(false);
      
      localStateManager.markInitialized(mockElement);
      expect(localStateManager.isInitialized(mockElement)).toBe(true);
      expect(localStateManager.hasScheduledRender(mockElement)).toBe(true);
    });

    /**
     * Test that having state implies initialization
     * 
     * When a root has state set, it should be considered
     * initialized without needing an explicit mark.
     */
    test("considers state as initialized", () => {
      const state = { count: 5 };
      localStateManager.setRootState(mockElement, state);
      
      expect(localStateManager.isInitialized(mockElement)).toBe(true);
      expect(localStateManager.hasScheduledRender(mockElement)).toBe(false);
    });
  });

  describe("render scheduling", () => {
    /**
     * Test render callback scheduling
     * 
     * The StateManager should schedule render callbacks
     * and call them with the correct state and element.
     */
    test("schedules render callbacks", (done) => {
      const state = { count: 5 };
      let callbackCalled = false;
      
      localStateManager.setRenderCallback((s, e) => {
        expect(s).toBe(state);
        expect(e).toBe(mockElement);
        callbackCalled = true;
        done();
      });
      localStateManager.setRootState(mockElement, state);
      localStateManager.scheduleRender(mockElement);
    });

    /**
     * Test duplicate render prevention
     * 
     * Multiple render schedules for the same element
     * should be deduplicated to avoid unnecessary renders.
     */
    test("does not schedule duplicate renders", (done) => {
      const state = { count: 5 };
      let callCount = 0;
      
      localStateManager.setRenderCallback(() => {
        callCount++;
        if (callCount === 1) {
          setTimeout(() => {
            expect(callCount).toBe(1);
            done();
          }, 10);
        }
      });
      localStateManager.setRootState(mockElement, state);
      
      localStateManager.scheduleRender(mockElement);
      localStateManager.scheduleRender(mockElement); // Should be ignored
    });

    /**
     * Test render callback removal
     * 
     * Should be able to remove render callbacks
     * without errors.
     */
    test("removes render callbacks", () => {
      const callback = () => {};
      
      localStateManager.setRenderCallback(callback);
      localStateManager.removeRenderCallback(callback);
      
      // Should not throw
      expect(() => localStateManager.scheduleRender(mockElement)).not.toThrow();
    });

    /**
     * Test error handling in render callbacks
     * 
     * Errors in one callback should not prevent
     * other callbacks from executing.
     */
    test("handles callback errors gracefully", (done) => {
      const state = { count: 5 };
      let goodCallbackCalled = false;
      
      localStateManager.setRenderCallback(() => {
        throw new Error("Test error");
      });
      localStateManager.setRenderCallback(() => {
        goodCallbackCalled = true;
        setTimeout(() => {
          expect(goodCallbackCalled).toBe(true);
          expect(consoleWarnSpy).toHaveBeenCalledWith("impetus: render callback error", expect.any(Error));
          done();
        }, 0);
      });
      localStateManager.setRootState(mockElement, state);
      localStateManager.scheduleRender(mockElement);
    });
  });

  describe("clear method", () => {
    /**
     * Test clearing all state
     * 
     * The clear method should reset the StateManager
     * to its initial state.
     */
    test("clears all state", () => {
      const state = { count: 5 };
      const callback = () => {};
      
      localStateManager.addRoot(mockElement);
      localStateManager.setRootState(mockElement, state);
      localStateManager.markInitialized(mockElement);
      localStateManager.setRenderCallback(callback);
      
      localStateManager.clear();
      
      expect(localStateManager.getRootCount()).toBe(0);
      expect(localStateManager.getRootState(mockElement)).toBeUndefined();
      expect(localStateManager.isInitialized(mockElement)).toBe(false);
    });
  });
});

describe("makeReactive", () => {
  let mockElement: Element;

  /**
   * Set up a fresh mock element for each test
   * 
   * Also clear the global state manager to ensure
   * tests don't interfere with each other.
   */
  beforeEach(() => {
    mockElement = document.createElement("div");
    stateManager.clear(); // Clear global state between tests
  });

  /**
   * Test handling of non-object values
   * 
   * Non-object values should be returned unchanged
   * as they cannot be made reactive.
   */
  test("returns non-objects unchanged", () => {
    expect(makeReactive(null as any, mockElement)).toBe(null);
    expect(makeReactive(undefined as any, mockElement)).toBe(undefined);
    expect(makeReactive("string" as any, mockElement)).toBe("string");
    expect(makeReactive(123 as any, mockElement)).toBe(123);
    expect(makeReactive(true as any, mockElement)).toBe(true);
  });

  /**
   * Test reactive proxy creation for objects
   * 
   * Objects should be wrapped in a reactive proxy
   * that tracks property access and mutations.
   */
  test("creates reactive proxy for objects", () => {
    const obj = { count: 5 };
    const proxy = makeReactive(obj, mockElement);
    
    expect(isReactiveProxy(proxy)).toBe(true);
    expect(proxy).not.toBe(obj); // Should be a different object
    expect(proxy.count).toBe(5);
  });

  /**
   * Test reactive proxy creation for arrays
   * 
   * Arrays should also be wrapped in reactive proxies
   * that track mutations like push, pop, etc.
   */
  test("creates reactive proxy for arrays", () => {
    const arr = [1, 2, 3];
    const proxy = makeReactive(arr, mockElement);
    
    expect(isReactiveProxy(proxy)).toBe(true);
    expect(Array.isArray(proxy)).toBe(true);
    expect(proxy.length).toBe(3);
    expect(proxy[0]).toBe(1);
  });

  /**
   * Test method binding for root objects
   * 
   * Methods on root objects should be bound to the proxy
   * so 'this' refers to the reactive object.
   */
  test("binds methods for root objects", () => {
    const obj = {
      count: 5,
      increment(this: any) {
        this.count++;
        return this.count;
      }
    };
    
    const proxy = makeReactive(obj, mockElement, true);
    const result = proxy.increment();
    
    expect(result).toBe(6);
    expect(proxy.count).toBe(6);
  });

  /**
   * Test nested object reactivity
   * 
   * Nested objects and arrays should also be made
   * reactive automatically.
   */
  test("makes nested objects reactive", () => {
    const obj = {
      user: {
        profile: {
          name: "John"
        }
      },
      items: [1, 2, 3]
    };
    
    const proxy = makeReactive(obj, mockElement);
    
    expect(isReactiveProxy(proxy)).toBe(true);
    expect(isReactiveProxy(proxy.user)).toBe(true);
    expect(isReactiveProxy(proxy.user.profile)).toBe(true);
    expect(isReactiveProxy(proxy.items)).toBe(true);
  });

  /**
   * Test special object handling
   * 
   * Built-in objects like Date, Map, and Set should
   * not be made reactive as they have internal state.
   */
  test("does not make special objects reactive", () => {
    const date = new Date();
    const map = new Map();
    const set = new Set();
    
    const obj = {
      date,
      map,
      set,
      plain: { nested: true }
    };
    
    const proxy = makeReactive(obj, mockElement);
    
    expect(proxy.date).toBe(date); // Same instance
    expect(proxy.map).toBe(map); // Same instance
    expect(proxy.set).toBe(set); // Same instance
    expect(isReactiveProxy(proxy.plain)).toBe(true); // Plain object should be reactive
  });

  /**
   * Test proxy sharing for same object
   * 
   * The same object should return the same proxy
     * even when used with different elements.
   */
  test("shares proxies for same object", () => {
    const obj = { count: 5 };
    const element1 = document.createElement("div");
    const element2 = document.createElement("span");
    
    const proxy1 = makeReactive(obj, element1);
    const proxy2 = makeReactive(obj, element2);
    
    expect(proxy1).toBe(proxy2); // Should be same proxy
    expect(getProxyRoots(proxy1)).toContain(element1);
    expect(getProxyRoots(proxy1)).toContain(element2);
  });

  /**
   * Test render triggering on property change
   * 
   * Changing a property on a reactive proxy should
   * trigger a render callback.
   */
  test("triggers render on property change", async () => {
    const obj = { count: 5 };
    let callbackCalled = false;
    
    stateManager.setRenderCallback(() => {
      callbackCalled = true;
    });
    // Set the root state so scheduleRender will call callbacks
    stateManager.setRootState(mockElement, obj);
    const proxy = makeReactive(obj, mockElement);
    
    proxy.count = 10;
    
    // Wait for microtask
    await flushMicrotasks();
    expect(callbackCalled).toBe(true);
  });

  /**
   * Test render triggering on property deletion
   * 
   * Deleting a property on a reactive proxy should
   * also trigger a render callback.
   */
  test("triggers render on property deletion", async () => {
    const obj = { name: "test" };
    let callbackCalled = false;
    
    stateManager.setRenderCallback(() => {
      callbackCalled = true;
    });
    // Set the root state so scheduleRender will call callbacks
    stateManager.setRootState(mockElement, obj);
    const proxy = makeReactive(obj, mockElement);
    
    delete (proxy as any).name;
    
    // Wait for microtask
    await flushMicrotasks();
    expect(callbackCalled).toBe(true);
  });

  /**
   * Test array mutation handling
   * 
   * Array methods like push should trigger renders
   * when they mutate the array.
   */
  test("handles array mutations", async () => {
    const arr = [1, 2, 3];
    let callbackCalled = false;
    
    stateManager.setRenderCallback(() => {
      callbackCalled = true;
    });
    // Set the root state so scheduleRender will call callbacks
    stateManager.setRootState(mockElement, arr);
    const proxy = makeReactive(arr, mockElement);
    
    proxy.push(4);
    
    // Wait for microtask
    await flushMicrotasks();
    expect(callbackCalled).toBe(true);
    expect((arr as any).length).toBe(4);
  });

  /**
   * Test array method preservation
   * 
   * Array methods should still work correctly
   * on the reactive proxy.
   */
  test("preserves array methods", () => {
    const arr = [1, 2, 3];
    const proxy = makeReactive(arr, mockElement);
    
    expect(typeof proxy.push).toBe("function");
    expect(typeof proxy.pop).toBe("function");
    expect(typeof proxy.map).toBe("function");
    expect(typeof proxy.filter).toBe("function");
    
    const doubled = proxy.map((x: number) => x * 2);
    expect(doubled).toEqual([2, 4, 6]);
  });
});

describe("reactive proxy utilities", () => {
  let mockElement: Element;

  /**
   * Set up a fresh mock element for each test
   */
  beforeEach(() => {
    mockElement = document.createElement("div");
  });

  /**
   * Test proxy identification
   * 
   * The isReactiveProxy function should correctly
   * identify reactive proxies.
   */
  test("isReactiveProxy identifies proxies", () => {
    const obj = { count: 5 };
    const proxy = makeReactive(obj, mockElement);
    
    expect(isReactiveProxy(proxy)).toBe(true);
    expect(isReactiveProxy(obj)).toBe(false);
    expect(isReactiveProxy(null)).toBe(false);
    expect(isReactiveProxy({})).toBe(false);
  });

  /**
   * Test proxy root tracking
   * 
   * The getProxyRoots function should return
   * all elements associated with a proxy.
   */
  test("getProxyRoots returns associated roots", () => {
    const obj = { count: 5 };
    const element1 = document.createElement("div");
    const element2 = document.createElement("span");
    
    const proxy = makeReactive(obj, element1);
    const roots = getProxyRoots(proxy);
    
    expect(roots).toContain(element1);
    expect(roots.size).toBe(1);
    
    // Add second root
    makeReactive(obj, element2);
    const roots2 = getProxyRoots(proxy);
    expect(roots2).toContain(element1);
    expect(roots2).toContain(element2);
    expect(roots2.size).toBe(2);
  });
});
