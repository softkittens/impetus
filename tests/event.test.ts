import { expect, test, describe, beforeEach } from "./setup";
import { evalInScope } from "../src/expression";

describe("Event Handling", () => {
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

  test("$event.outside should work for click outside detection", () => {
    const state = { open: true };
    const mockEvent = {
      target: { tagName: 'BODY' }, // Click outside
      outside: true
    } as any;
    
    const result = evalInScope("$event.outside && open ? false : true", state, mockEvent);
    expect(result).toBe(false);
  });

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
