/**
 * Type definitions for the Impetus framework
 * 
 * This file contains all the TypeScript types and interfaces used
 * throughout the framework. Having types defined centrally provides
 * better type safety, IDE autocompletion, and documentation.
 */

/**
 * Represents the scope object for component state
 * 
 * The scope is a plain JavaScript object that holds all the reactive
 * data for a component. It's used as the context when evaluating
 * expressions in templates.
 * 
 * @example
 * const scope: Scope = {
 *   message: "Hello",
 *   count: 0,
 *   user: { name: "John" }
 * };
 */
export type Scope = Record<string, any>;

/**
 * Represents an attribute binding in a template
 * 
 * Attribute bindings connect HTML attributes to JavaScript expressions.
 * When the expression's value changes, the attribute is updated.
 * 
 * @property el - The DOM element with the bound attribute
 * @property attr - The attribute name (e.g., "class", "value", "@if")
 * @property expr - The JavaScript expression to evaluate
 * 
 * @example
 * // For <div class="{isActive ? 'active' : ''}">
 * const binding: AttrBinding = {
 *   el: divElement,
 *   attr: "class",
 *   expr: "isActive ? 'active' : ''"
 * };
 */
export type AttrBinding = { el: Element; attr: string; expr: string };
/**
 * Represents a text interpolation binding in a template
 * 
 * Text interpolations are expressions within text nodes that get
 * replaced with their evaluated values. They allow dynamic text
 * content within HTML elements.
 * 
 * @property node - The text node containing the interpolation
 * @property template - The original text with expression placeholders
 * 
 * @example
 * // For "Hello {name}!"
 * const binding: InterpBinding = {
 *   node: textNode,
 *   template: "Hello {name}!"
 * };
 */
export type InterpBinding = { node: Text; template: string };

/**
 * Hooks for devtools integration
 * 
 * These hooks allow the devtools to monitor and inspect the framework's
 * internal operations. Each hook is called at specific points during
 * component lifecycle and rendering.
 * 
 * All hooks are optional - the devtools only implements the ones it needs.
 * This allows for graceful degradation when devtools are not present.
 * 
 * @property onInitRoot - Called when a new component root is initialized
 * @property onCollect - Called after collecting bindings from a template
 * @property onRenderStart - Called before rendering begins
 * @property onRenderEnd - Called after rendering completes with timing info
 * @property onDirective - Called when a directive is processed
 * @property onWireEvents - Called after event handlers are wired
 * @property onDestroy - Called when a component is destroyed
 */
export type DevtoolsHooks = {
  onInitRoot?: (root: Element, state: Scope) => void;
  onCollect?: (root: Element, counts: { attrs: number; interps: number }) => void;
  onRenderStart?: (root: Element) => void;
  onRenderEnd?: (root: Element, stats: { duration: number }) => void;
  onDirective?: (el: Element, type: string, meta?: any) => void;
  onWireEvents?: (root: Element, count: number) => void;
  onDestroy?: (root: Element) => void;
};

/**
 * Represents an event handler registration
 * 
 * This type tracks event handlers that have been attached to DOM elements.
 * It's used to store references so handlers can be properly removed
 * when components are destroyed, preventing memory leaks.
 * 
 * @property el - The DOM element the handler is attached to
 * @property event - The event type (e.g., "click", "input", "submit")
 * @property handler - The event listener function
 * 
 * @example
 * const registration: EventHandler = {
 *   el: buttonElement,
 *   event: "click",
 *   handler: handleClick
 * };
 */
export type EventHandler = { el: EventTarget; event: string; handler: EventListener };

/**
 * Handler function for framework directives
 * 
 * Directive handlers implement the behavior for special attributes
 * like @if, @each, @show, etc. Each directive has its own handler
 * that controls how the element behaves based on the expression.
 * 
 * @param el - The element with the directive
 * @param expr - The expression to evaluate
 * @param state - The component scope for evaluation
 * @param root - The root element (optional, used for some directives)
 * 
 * @example
 * // Handler for @if directive
 * const ifHandler: DirectiveHandler = (el, expr, state) => {
 *   const shouldShow = evalInScope(expr, state);
 *   el.style.display = shouldShow ? '' : 'none';
 * };
 */
export interface DirectiveHandler {
  (el: Element, expr: string, state: Scope, root?: Element): void;
}

/**
 * Handler function for special attributes
 * 
 * Attribute handlers provide custom behavior for specific attributes
 * that need special handling beyond simple value assignment. This includes
 * attributes like "value", "checked", "class", and "style" which have
 * complex behavior or type conversion requirements.
 * 
 * The handler returns a boolean indicating whether it handled the
 * attribute. If false, the default attribute handling is used.
 * 
 * @param el - The element with the attribute
 * @param expr - The expression to evaluate
 * @param raw - The raw attribute value
 * @param state - The component scope for evaluation
 * @param root - The root element (always provided for attributes)
 * @returns True if the attribute was handled, false otherwise
 * 
 * @example
 * // Handler for "value" attribute
 * const valueHandler: AttributeHandler = (el, expr, raw, state) => {
 *   const value = evalInScope(expr, state);
 *   setValueProp(el, value);
 *   return true; // We handled it
 * };
 */
export interface AttributeHandler {
  (el: Element, expr: string, raw: string, state: Scope, root: Element): boolean;
}
