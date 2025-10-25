/**
 * IMPETUS FRAMEWORK - Rendering Module
 * 
 * This module handles updating the DOM when component state changes.
 * It's the "V" in MVC (View) - the part that actually changes what users see.
 * 
 * WHY THIS MODULE EXISTS:
 * - Updates DOM elements when state changes
 * - Handles text interpolations like "Hello {name}!"
 * - Processes attribute bindings like class="{active}"
 * - Executes directives like @if, @show, @each
 */

import type { Scope } from './types';
import { evalInScope, invalidateComputedCache } from './expression';
import { unwrapExpr } from './utils';
import { DIRECTIVES, PLACEHOLDERS } from './constants';
import { directiveHandlers } from './directives';
import { attrHandlers, handleGenericAttribute } from './attributes';
import { getAttributeBindings, getInterpolationBindings } from './bindings';

/**
 * MAIN RENDERING FUNCTION
 * 
 * This is the heart of the reactive system - it updates the UI when data changes
 * 
 * @param state - The component state object
 * @param root - The component's root DOM element
 * 
 * WHY: This function is called whenever component state changes
 * It updates only the parts of the DOM that depend on the changed data
 */
export function renderBindings(state: Scope, root: Element): void {
  // Notify devtools that rendering is starting
  try { (window as any).devhooks?.onRenderStart?.(root); } catch {}
  
  // STEP 1: Update all attribute bindings
  // This includes things like class, style, disabled, etc.
  renderAttributeBindings(state, root);
  
  // STEP 2: Update all text interpolations
  // This includes things like "Hello {name}!" in text content
  renderTextInterpolations(state, root);
  
  // Notify devtools that rendering is finished
  try { (window as any).devhooks?.onRenderEnd?.(root); } catch {}
}

/**
 * ATTRIBUTE BINDING RENDERING
 * 
 * This function updates all attribute bindings in a component
 * 
 * @param state - The component state object
 * @param root - The component's root DOM element
 * 
 * WHY: Attributes control element appearance and behavior
 * CSS classes, styles, form states, etc. all need to update when data changes
 */
function renderAttributeBindings(state: Scope, root: Element): void {
  // Get all attribute bindings for this component
  const bindings = getAttributeBindings(root);
  
  for (const binding of bindings) {
    const raw = binding.expr || "";
    const expr = unwrapExpr(raw); // Remove any wrapper syntax
    const attrName = binding.attr;
    
    /**
     * STEP 1: Handle directives first
     * 
     * Directives are special attributes that control element visibility
     * and structure (like @if, @show, @each)
     */
    if (handleDirective(binding.el, attrName, expr, state, root)) {
      continue; // Skip regular attribute processing for directives
    }
    
    /**
     * STEP 2: Skip disconnected elements
     * 
     * If an element is no longer in the DOM, don't try to update it
     * WHY: Prevents errors and improves performance
     */
    try { if (!(binding.el as any).isConnected) continue; } catch {}
    
    /**
     * STEP 3: Use specialized handlers for special attributes
     * 
     * Some attributes need special handling (value, class, style, etc.)
     * We have optimized handlers for these common cases
     */
    const handler = attrHandlers[attrName];
    if (handler && handler(binding.el, expr, raw, state, root)) {
      continue; // Handler took care of it
    }
    
    /**
     * STEP 4: Handle generic attributes
     * 
     * For all other attributes, use the generic handler
     * This evaluates the expression and sets the attribute value
     */
    handleGenericAttribute(binding.el, attrName, expr, raw, state);
  }
}

/**
 * DIRECTIVE HANDLING
 * 
 * Directives are special attributes that control element structure and visibility
 * Examples: @if="showModal", @show="isActive", @each="items"
 * 
 * @param el - The DOM element
 * @param attrName - The attribute name
 * @param expr - The expression to evaluate
 * @param state - The component state
 * @param root - The component root element
 * @returns True if this was a directive and was handled
 * 
 * WHY: Directives need special handling beyond simple attribute setting
 * They can add/remove elements, show/hide content, or repeat templates
 */
function handleDirective(el: Element, attrName: string, expr: string, state: Scope, root: Element): boolean {
  // Handle structural and visibility directives
  if (DIRECTIVES.IF.has(attrName) || DIRECTIVES.SHOW.has(attrName) || DIRECTIVES.EACH.has(attrName)) {
    // Notify devtools about directive execution
    try { (window as any).devhooks?.onDirective?.(el, attrName, { expr }); } catch {}
    
    // Execute the directive handler
    // WHY: Each directive has its own logic for manipulating the DOM
    directiveHandlers[attrName]?.(el, expr, state, attrName === '@show' ? undefined : root);
    return true;
  }
  
  // @else and @transition are handled by other parts of the system
  // They're consumed by the @if handler or transition system
  return DIRECTIVES.ELSE.has(attrName) || DIRECTIVES.TRANSITION.has(attrName);
}

/**
 * TEXT INTERPOLATION RENDERING
 * 
 * This function updates all text interpolations in a component
 * Text interpolations are expressions inside text content
 * Example: "Hello {name}! You have {count} messages."
 * 
 * @param state - The component state object
 * @param root - The component's root DOM element
 * 
 * WHY: Most UI text contains dynamic data that needs to update
 * User names, counts, dates, etc. all change based on state
 */
function renderTextInterpolations(state: Scope, root: Element): void {
  // Get all text interpolation bindings for this component
  const bindings = getInterpolationBindings(root);
  
  for (const binding of bindings) {
    /**
     * PROCESS ESCAPED BRACES AND INTERPOLATE
     * 
     * We need to handle escaped braces ({{ and }}) separately from real braces ({ })
     * This allows users to literally show braces in their text
     */
    const rendered = binding.template
      // Step 1: Replace escaped braces with placeholders
      .replace(/\{\{/g, PLACEHOLDERS.LBRACE)  // {{ → placeholder
      .replace(/\}\}/g, PLACEHOLDERS.RBRACE)  // }} → placeholder
      
      // Step 2: Replace real braces with evaluated expressions
      .replace(/\{([^}]+)\}/g, (_, expr) => {
        // Evaluate the expression in component context
        const v = evalInScope(String(expr).trim(), state);
        // Convert to string, use empty string for null/undefined
        return v == null ? "" : String(v);
      })
      
      // Step 3: Replace placeholders back to literal braces
      .replace(new RegExp(PLACEHOLDERS.LBRACE, "g"), "{")  // placeholder → {
      .replace(new RegExp(PLACEHOLDERS.RBRACE, "g"), "}"); // placeholder → }
    
    // Update the DOM with the rendered text
    binding.node.textContent = rendered;
  }
}
