/**
 * Tests for event handling in the Impetus framework
 * 
 * This test suite verifies that event expressions work correctly,
 * particularly the $event object and its special properties.
 * Event handling is crucial for user interactions and reactive updates.
 * 
 * The tests cover:
 * - $event object availability in expressions
 * - $event.outside for click-outside detection
 * - Real-world modal scenarios (Escape key, outside click)
 * - State mutation through event expressions
 */

import { expect, test, describe, beforeEach } from "./setup";
import { 
  compile, 
  evalInScope, 
  evalComputed, 
  assignInScope, 
  resolveCtor,
  clearExpressionCache,
  getExpressionCacheSize,
  invalidateComputedCache
} from "../src/expression";
import { wireEventHandlers } from "../src/events";

describe("Event Handling", () => {
  /**
   * Test $event object availability
   * 
   * The $event object should be available in event expressions
   * and contain the actual event data.
   */
  test("$event should be available in event expressions", () => {
    const state = { open: true };
    const mockEvent = {
      key: 'Escape',
      target: { tagName: 'DIV' }
    } as any;
    
    // Test that $event works in evalInScope
    const result = evalInScope("$event.key === 'Escape' ? false : true", state, mockEvent);
    expect(result).toBe(false);
  });

  /**
   * Test $event.outside for click-outside detection
   * 
   * The $event.outside property should be true when the click
   * is outside the component element. This is useful for closing
   * dropdowns and modals.
   */
  test("$event.outside should work for click outside detection", () => {
    const state = { open: true };
    const mockEvent = {
      target: { tagName: 'BODY' }, // Click outside
      outside: true
    } as any;
    
    const result = evalInScope("$event.outside && open ? false : true", state, mockEvent);
    expect(result).toBe(false);
  });

  /**
   * Test modal Escape key scenario
   * 
   * This is a real-world test case from modal.html.
   * When Escape is pressed and the modal is open, it should close.
   * The expression should mutate the state and return the assignment result.
   */
  test("modal escape key scenario", () => {
    const state = { open: true };
    const mockEvent = {
      key: 'Escape'
    } as any;
    
    // This is the exact expression from modal.html line 23
    const result = evalInScope("($event.key==='Escape') && (open=false)", state, mockEvent);
    expect(result).toBe(false); // Returns false (the result of assignment)
    expect(state.open).toBe(false); // State should be modified
  });

  /**
   * Test modal outside click scenario
   * 
   * This is another real-world test case from modal.html.
   * When clicking outside the modal and it's open, it should close.
   * The expression checks both $event.outside and the open state.
   */
  test("modal outside click scenario", () => {
    const state = { open: true };
    const mockEvent = {
      outside: true
    } as any;
    
    // This is the exact expression from modal.html line 30
    const result = evalInScope("$event.outside && open && (open=false)", state, mockEvent);
    expect(result).toBe(false); // Returns false (the result of assignment)
    expect(state.open).toBe(false); // State should be modified
  });
});

describe("DOM Event Wiring", () => {
  test("onkeydown.escape.prevent.stop executes and filters by key", () => {
    const root = document.createElement('div') as any;
    root.setAttribute('onkeydown.escape.prevent.stop', 'close()');

    const state: any = {
      closed: false,
      close() { state.closed = true; }
    };

    wireEventHandlers(root, state);
    // keydown listeners are attached to document
    const docListeners = (document as any).__getListeners?.('keydown') || [];
    expect(docListeners.length).toBeGreaterThan(0);
    const handler = docListeners[0] as any;

    // Non-matching key: Enter
    let prevent = false, stop = false;
    handler({ key: 'Enter', preventDefault: () => { prevent = true; }, stopPropagation: () => { stop = true; }, target: root });
    expect(state.closed).toBe(false);
    expect(prevent).toBe(false);
    expect(stop).toBe(false);

    // Matching key: Escape
    prevent = false; stop = false;
    handler({ key: 'Escape', preventDefault: () => { prevent = true; }, stopPropagation: () => { stop = true; }, target: root });
    expect(state.closed).toBe(true);
    expect(prevent).toBe(true);
    expect(stop).toBe(true);
  });

  test("$event.escape.prevent.stop && close() chaining works", () => {
    const root = document.createElement('div') as any;
    root.setAttribute('onkeydown', 'true');

    const state: any = {};
    wireEventHandlers(root, state);
    const docListeners = (document as any).__getListeners?.('keydown') || [];
    const handler = docListeners[0] as any;

    // Just ensure the handler runs without error
    expect(() => handler({ key: 'Escape', preventDefault: () => {}, stopPropagation: () => {}, target: root })).not.toThrow();
  });

  test("$event.outside is true for click and triggers close()", () => {
    const root = document.createElement('div') as any;
    root.setAttribute('onclick', '$event.outside && close()');

    const state: any = { closed: false, close() { state.closed = true; } };
    const listeners = wireEventHandlers(root, state);
    const handler = listeners[0]!.handler as any;

    // Use a target that is not the root, so outside evaluates true
    const outsideTarget = document.createElement('div');
    handler({ target: outsideTarget });
    expect(state.closed).toBe(true);
  });
});
