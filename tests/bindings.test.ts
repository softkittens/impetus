/**
 * Tests for bindings module behaviour
 */

import { describe, test, expect } from "./setup";
import { collectBindingsForRoot, getInterpolationBindings, getAttributeBindings } from "../src/bindings";

describe("Bindings", () => {
  test("collectBindingsForRoot uses document.createTreeWalker with correct context", () => {
    const root = document.createElement("div");
    root.textContent = "Hello {name}";

    const originalCreateTreeWalker = (document as any).createTreeWalker;

    const textNode = {
      nodeValue: root.textContent,
      parentElement: root
    } as any;

    const walker = {
      nodes: [textNode],
      index: -1,
      nextNode() {
        this.index += 1;
        return this.nodes[this.index] ?? null;
      }
    };

    (document as any).createTreeWalker = function (this: any) {
      if (this !== document) {
        throw new TypeError("Illegal invocation");
      }
      return walker;
    };

    try {
      expect(() => collectBindingsForRoot(root)).not.toThrow();
      const bindings = getInterpolationBindings(root);
      expect(bindings.length).toBe(1);
    } finally {
      (document as any).createTreeWalker = originalCreateTreeWalker;
    }
  });

  test("collectBindingsForRoot skips 'scope' attribute and still collects directive bindings", () => {
    const root = document.createElement("div");
    // scope JSON should not be treated as an attribute binding
    (root as any).setAttribute("scope", '{"open": false}');

    // place the directive on the root (mock querySelectorAll doesn't traverse children)
    (root as any).setAttribute("@show", "open");

    // collect
    expect(() => collectBindingsForRoot(root)).not.toThrow();

    const attrBindings = getAttributeBindings(root);
    // ensure no binding created for 'scope'
    expect(attrBindings.find(b => b.attr === 'scope')).toBeUndefined();
    // ensure directive binding was collected on root
    expect(attrBindings.find(b => b.attr === '@show')).toBeDefined();
  });
});
