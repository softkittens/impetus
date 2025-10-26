/**
 * Tests for bindings module behaviour
 */

import { describe, test, expect } from "./setup";
import { collectBindingsForRoot, getInterpolationBindings } from "../src/bindings";

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
});
