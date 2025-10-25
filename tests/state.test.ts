import { expect, test, describe, beforeEach, afterEach, spyOn } from "./setup";
import { StateManager, makeReactive, isReactiveProxy, getProxyRoots, stateManager } from "../src/state";

describe("State", () => {
  let localStateManager: StateManager;
  let mockElement: any;

  beforeEach(() => {
    localStateManager = new StateManager();
    mockElement = document.createElement("div");
  });

  let consoleWarnSpy: any;

  beforeEach(() => {
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe("root management", () => {
    test("adds and removes roots", () => {
      expect(localStateManager.getRootCount()).toBe(0);
      
      localStateManager.addRoot(mockElement);
      expect(localStateManager.getRootCount()).toBe(1);
      expect(localStateManager.getAllRoots()).toContain(mockElement);
      
      localStateManager.removeRoot(mockElement);
      expect(localStateManager.getRootCount()).toBe(0);
      expect(localStateManager.getAllRoots()).not.toContain(mockElement);
    });

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
    test("sets and gets root state", () => {
      const state = { count: 5, name: "test" };
      
      localStateManager.setRootState(mockElement, state);
      expect(localStateManager.getRootState(mockElement)).toBe(state);
    });

    test("returns undefined for non-existent state", () => {
      expect(localStateManager.getRootState(mockElement)).toBeUndefined();
    });
  });

  describe("initialization tracking", () => {
    test("tracks initialization status", () => {
      expect(localStateManager.isInitialized(mockElement)).toBe(false);
      
      localStateManager.markInitialized(mockElement);
      expect(localStateManager.isInitialized(mockElement)).toBe(true);
      expect(localStateManager.hasScheduledRender(mockElement)).toBe(true);
    });

    test("considers state as initialized", () => {
      const state = { count: 5 };
      localStateManager.setRootState(mockElement, state);
      
      expect(localStateManager.isInitialized(mockElement)).toBe(true);
      expect(localStateManager.hasScheduledRender(mockElement)).toBe(false);
    });
  });

  describe("render scheduling", () => {
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

    test("removes render callbacks", () => {
      const callback = () => {};
      
      localStateManager.setRenderCallback(callback);
      localStateManager.removeRenderCallback(callback);
      
      // Should not throw
      expect(() => localStateManager.scheduleRender(mockElement)).not.toThrow();
    });

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

  beforeEach(() => {
    mockElement = document.createElement("div");
    stateManager.clear(); // Clear global state between tests
  });

  test("returns non-objects unchanged", () => {
    expect(makeReactive(null as any, mockElement)).toBe(null);
    expect(makeReactive(undefined as any, mockElement)).toBe(undefined);
    expect(makeReactive("string" as any, mockElement)).toBe("string");
    expect(makeReactive(123 as any, mockElement)).toBe(123);
    expect(makeReactive(true as any, mockElement)).toBe(true);
  });

  test("creates reactive proxy for objects", () => {
    const obj = { count: 5 };
    const proxy = makeReactive(obj, mockElement);
    
    expect(isReactiveProxy(proxy)).toBe(true);
    expect(proxy).not.toBe(obj); // Should be a different object
    expect(proxy.count).toBe(5);
  });

  test("creates reactive proxy for arrays", () => {
    const arr = [1, 2, 3];
    const proxy = makeReactive(arr, mockElement);
    
    expect(isReactiveProxy(proxy)).toBe(true);
    expect(Array.isArray(proxy)).toBe(true);
    expect(proxy.length).toBe(3);
    expect(proxy[0]).toBe(1);
  });

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
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(callbackCalled).toBe(true);
  });

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
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(callbackCalled).toBe(true);
  });

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
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(callbackCalled).toBe(true);
    expect((arr as any).length).toBe(4);
  });

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

  beforeEach(() => {
    mockElement = document.createElement("div");
  });

  test("isReactiveProxy identifies proxies", () => {
    const obj = { count: 5 };
    const proxy = makeReactive(obj, mockElement);
    
    expect(isReactiveProxy(proxy)).toBe(true);
    expect(isReactiveProxy(obj)).toBe(false);
    expect(isReactiveProxy(null)).toBe(false);
    expect(isReactiveProxy({})).toBe(false);
  });

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
