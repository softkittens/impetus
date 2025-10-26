/**
 * IMPETUS FRAMEWORK - Rendering Module
 * 
 * This module handles updating the DOM when component state changes.
 * It's the "V" in MVC (View) - the part that actually changes what users see.
 * 
 * Render phases (why this order):
 * - Attributes first: classes, styles, values, directives can affect layout/visibility
 * - Text next: interpolations are cheap and shouldn't be affected by attribute churn
 * 
 * Directive handling:
 * - Structural/visibility directives (`@if`, `@show`, `@each`) are dispatched to directive handlers
 * - `@transition` is not executed here; it is consumed by the `@show` handler and delegated
 *   to the transitions module to keep concerns separated
 * 
 * WHY THIS MODULE EXISTS:
 * - Updates DOM elements when state changes
 * - Handles text interpolations like "Hello {name}!"
 * - Processes attribute bindings like class="{active}"
 * - Executes directives like @if, @show, @each
 */

import type { Scope } from './types';
import { evalInScope, invalidateComputedCache } from './expression';
import { registerEffect } from './state';
import { unwrapExpr } from './utils';
import { DIRECTIVES, PLACEHOLDERS } from './constants';
import { directiveHandlers } from './directives';
import { getDevtoolsHooks } from './devtools-hooks';
import { attrHandlers, handleGenericAttribute } from './attributes';
import { getAttributeBindings, getInterpolationBindings } from './bindings';
import { collectBindingsForRoot } from './bindings';

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
const effectsInitialized = new WeakSet<Element>();

export function renderBindings(state: Scope, root: Element): void {
  // Notify devtools that rendering is starting
  const hooks = getDevtoolsHooks();
  try {
    if (hooks && typeof hooks.onRenderStart === 'function') {
      hooks.onRenderStart(root);
    }
  } catch {}
  const start = (typeof performance !== 'undefined' && performance.now)
    ? performance.now()
    : Date.now();
  // Defensive: ensure bindings are collected at least once for this root
  let ab = getAttributeBindings(root);
  let ib = getInterpolationBindings(root);
  if (ab.length === 0 && ib.length === 0) {
    try { collectBindingsForRoot(root); } catch {}
    ab = getAttributeBindings(root);
    ib = getInterpolationBindings(root);
  }

  // If effects already exist for this root, skip batch render (effects will update DOM)
  if (effectsInitialized.has(root)) {
    try {
      if (hooks && typeof hooks.onRenderEnd === 'function') {
        const end = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        hooks.onRenderEnd(root, { duration: end - start });
      }
    } catch {}
    return;
  }

  // If effects are not initialized for this root, register per-binding effects
  if (!effectsInitialized.has(root)) {
    // Attribute bindings
    for (const binding of ab) {
      registerEffect(() => {
        const raw = binding.expr || "";
        const expr = unwrapExpr(raw);
        const attrName = binding.attr;
        // Directives first (must run even if element is currently detached)
        if (handleDirective(binding.el, attrName, expr, state, root)) return;
        // Skip disconnected elements for non-directive attributes
        try { if (!(binding.el as any).isConnected) return; } catch {}
        // Specialized handlers
        const handler = attrHandlers[attrName];
        if (handler && handler(binding.el, expr, raw, state, root)) return;
        // Generic
        handleGenericAttribute(binding.el, attrName, expr, raw, state);
      }, root);
    }
    // Text interpolation bindings
    for (const binding of ib) {
      registerEffect(() => {
        const rendered = binding.template
          .replace(/\{\{/g, PLACEHOLDERS.LBRACE)
          .replace(/\}\}/g, PLACEHOLDERS.RBRACE)
          .replace(/\{([^}]+)\}/g, (_, expr) => {
            const v = evalInScope(String(expr).trim(), state);
            return v == null ? "" : String(v);
          })
          .replace(new RegExp(PLACEHOLDERS.LBRACE, "g"), "{")
          .replace(new RegExp(PLACEHOLDERS.RBRACE, "g"), "}");
        if (binding.node.textContent !== rendered) {
          binding.node.textContent = rendered;
        }
      }, root);
    }
    effectsInitialized.add(root);
    // Per-binding effects will now update the DOM; skip batch rendering
    try {
      if (hooks && typeof hooks.onRenderEnd === 'function') {
        const end = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        hooks.onRenderEnd(root, { duration: end - start });
      }
    } catch {}
    return;
  }
  
  // STEP 1: Update all attribute bindings
  // This includes things like class, style, disabled, etc.
  renderAttributeBindings(state, root);
  
  // STEP 2: Update all text interpolations
  // This includes things like "Hello {name}!" in text content
  renderTextInterpolations(state, root);
  
  // Notify devtools that rendering is finished
  const end = (typeof performance !== 'undefined' && performance.now)
    ? performance.now()
    : Date.now();
  try {
    if (hooks && typeof hooks.onRenderEnd === 'function') {
      hooks.onRenderEnd(root, { duration: end - start });
    }
  } catch {}
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
    const hooks = getDevtoolsHooks();
    try {
      if (hooks && typeof hooks.onDirective === 'function') {
        hooks.onDirective(el, attrName, { expr });
      }
    } catch {}
    
    // Execute the directive handler
    // WHY: Each directive has its own logic for manipulating the DOM
    const handler = directiveHandlers[attrName];
    if (typeof handler === 'function') {
      handler(el, expr, state, attrName === '@show' ? undefined : root);
    }
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
    
    // Update the DOM only if it actually changed
    if (binding.node.textContent !== rendered) {
      binding.node.textContent = rendered;
    }
  }
}
