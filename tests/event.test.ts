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
import { evalInScope } from "../src/expression";

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
