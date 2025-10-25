import { expect, test, describe } from "./setup";
import { evalInScope } from "../src/expression";

describe("Modal Fix Verification", () => {
  test("original modal expressions work correctly", () => {
    const state = { open: true };
    
    // Test the exact expression from modal.html line 23
    const escapeEvent = { key: 'Escape' } as any;
    const escapeResult = evalInScope("($event.key==='Escape') && (open=false)", state, escapeEvent);
    
    expect(escapeResult).toBe(false); // Returns false (assignment result)
    expect(state.open).toBe(false);   // State is updated
    
    // Reset state
    state.open = true;
    
    // Test the exact expression from modal.html line 30
    const outsideClickEvent = { outside: true } as any;
    const clickResult = evalInScope("$event.outside && open && (open=false)", state, outsideClickEvent);
    
    expect(clickResult).toBe(false); // Returns false (assignment result)
    expect(state.open).toBe(false);  // State is updated
  });

  test("simple interpolation works", () => {
    const state = { count: 42 };
    const result = evalInScope("count", state);
    expect(result).toBe(42);
  });

  test("complex expressions work", () => {
    const state = { count: 5, name: "test" };
    const result = evalInScope("count + 10", state);
    expect(result).toBe(15);
  });
});
