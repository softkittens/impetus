/**
 * Utility functions for the Impetus framework
 * 
 * This module contains various helper functions used throughout the framework.
 * These utilities handle common tasks like string manipulation, type coercion,
 * style/class normalization, and DOM-related operations. Having these in a
 * separate module keeps the core modules cleaner and promotes code reuse.
 */

import { DIRECTIVES } from './constants';

/**
 * Converts a kebab-case string to camelCase
 * 
 * This is used when converting HTML attribute names (which are kebab-case)
 * to JavaScript property names (which are camelCase). For example,
 * "my-attribute" becomes "myAttribute".
 * 
 * @param s - The kebab-case string to convert
 * @returns The camelCase version of the string
 * 
 * @example
 * toCamel('my-attribute') // returns 'myAttribute'
 * toCamel('data-user-id') // returns 'dataUserId'
 */
export function toCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
          .replace(/-+/g, '') // Remove multiple consecutive dashes
          .replace(/-$/, ''); // Remove trailing dash
}

/**
 * Converts a camelCase or snake_case string to kebab-case
 * 
 * This is used when converting JavaScript property names to CSS property names
 * or HTML attribute names. For example, "myAttribute" becomes "my-attribute".
 * It also handles edge cases like consecutive uppercase letters (e.g., "XMLParser"
 * becomes "xml-parser") and snake_case (e.g., "snake_case" becomes "snake-case").
 * 
 * @param s - The camelCase or snake_case string to convert
 * @returns The kebab-case version of the string
 * 
 * @example
 * toKebab('myAttribute') // returns 'my-attribute'
 * toKebab('XMLParser') // returns 'xml-parser'
 * toKebab('snake_case') // returns 'snake-case'
 */
export function toKebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2") // Handle consecutive uppercase letters
    .replace(/_/g, "-")
    .toLowerCase();
}

/**
 * Coerces a string value to its appropriate JavaScript type
 * 
 * HTML attributes are always strings, but we often need them as other types.
 * This function converts string values to their actual JavaScript types.
 * It handles common cases like boolean values, null, undefined, and numbers.
 * 
 * The order of checks is important:
 * 1. Check for boolean strings first ("true", "false")
 * 2. Check for null and undefined
 * 3. Check for numbers (but ensure it's not an empty string)
 * 4. Return the original string if no conversion matches
 * 
 * @param value - The string value to coerce
 * @returns The value coerced to its appropriate JavaScript type
 * 
 * @example
 * coerce("true") // returns true
 * coerce("123") // returns 123
 * coerce("hello") // returns "hello"
 * coerce("") // returns ""
 */
export function coerce(value: string): any {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (value === "undefined") return undefined;
  if (!isNaN(Number(value)) && value.trim() !== "") return Number(value);
  return value;
}

/**
 * Normalizes a value into a space-separated class string
 * 
 * This function handles various input formats for CSS classes:
 * - String: Returns as-is (already in correct format)
 * - Array: Joins all truthy values with spaces (handles nested arrays)
 * - Object: Joins keys with truthy values (useful for conditional classes)
 * - Other: Converts to string
 * 
 * This flexibility allows developers to use the most convenient format
 * for their use case. For example:
 * - class="static-class {dynamicClass}"
 * - :class="['foo', 'bar', condition && 'baz']"
 * - :class="{ active: isActive, disabled: isDisabled }"
 * 
 * @param value - The value to normalize (string, array, or object)
 * @returns A space-separated string of CSS classes
 * 
 * @example
 * normalizeClass('foo bar') // returns 'foo bar'
 * normalizeClass(['foo', 'bar', null, 'baz']) // returns 'foo bar baz'
 * normalizeClass({ foo: true, bar: false, baz: true }) // returns 'foo baz'
 */
export function normalizeClass(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.flat(Infinity) // Flatten nested arrays
                   .filter(Boolean) 
                   .map(String) 
                   .join(" ");
  }
  if (typeof value === "object") return Object.keys(value).filter((k) => value[k]).join(" ");
  return String(value);
}

/**
 * Normalizes a value into a CSS style string
 * 
 * This function handles various input formats for CSS styles:
 * - String: Returns as-is (already in correct format)
 * - Object: Converts to kebab-case CSS properties with values
 * 
 * When using an object, property names are converted from camelCase to
 * kebab-case (e.g., "backgroundColor" becomes "background-color").
 * Values that are null or false are excluded from the output.
 * 
 * This allows developers to write styles in a more JavaScript-friendly way:
 * :style="{ color: 'red', backgroundColor: 'blue', display: isActive ? 'block' : false }"
 * 
 * @param value - The value to normalize (string or object)
 * @returns A semicolon-separated CSS style string
 * 
 * @example
 * normalizeStyle('color: red; background: blue') // returns 'color: red; background: blue'
 * normalizeStyle({ color: 'red', backgroundColor: 'blue' }) // returns 'color:red;background-color:blue'
 * normalizeStyle({ display: false, color: 'red' }) // returns 'color:red'
 */
export function normalizeStyle(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([, val]) => val != null && val !== false)
      .map(([k, val]) => `${toKebab(k)}:${String(val)}`)
      .join(";");
  }
  return String(value);
}

/**
 * Unwraps an expression by removing outer braces
 * 
 * In templates, expressions can be wrapped in braces: {expression}
 * Sometimes expressions might be double-wrapped: {{expression}}
 * This function removes the outer braces to get the raw expression.
 * 
 * It only strips braces twice if the result still has braces after
 * the first strip. This prevents accidentally stripping braces that
 * are part of the actual expression (like object literals).
 * 
 * @param raw - The raw expression string, possibly wrapped in braces
 * @returns The expression without outer braces
 * 
 * @example
 * unwrapExpr('{name}') // returns 'name'
 * unwrapExpr('{{name}}') // returns 'name'
 * unwrapExpr('{obj.prop}') // returns 'obj.prop'
 * unwrapExpr('{ { nested: true } }') // returns '{ nested: true }'
 */
export function unwrapExpr(raw: string): string {
  let s = (raw || "").trim();
  const stripOnce = (t: string) => (t.startsWith("{") && t.endsWith("}")) ? t.slice(1, -1).trim() : t;
  // Only strip braces twice if the result still has braces
  s = stripOnce(s);
  if (s.startsWith("{") && s.endsWith("}")) {
    s = stripOnce(s);
  }
  return s;
}

/**
 * Checks if a value contains braces
 * 
 * This is used to determine if an attribute value contains an expression
 * that needs to be evaluated. If there are no braces, the value can be
 * used as-is without expression evaluation.
 * 
 * @param value - The value to check (can be null)
 * @returns True if the value contains at least one opening brace
 * 
 * @example
 * hasBraces('Hello {name}') // returns true
 * hasBraces('static value') // returns false
 * hasBraces(null) // returns false
 */
export function hasBraces(value: string | null): boolean {
  return !!(value && value.includes("{"));
}

/**
 * Checks if an attribute name is a framework directive
 * 
 * Directives are special attributes that control framework behavior
 * (like @if, @each, @show, etc.). This function checks if a given
 * attribute name is any of the known directives.
 * 
 * @param name - The attribute name to check
 * @returns True if the name is a directive
 * 
 * @example
 * isDirective('@if') // returns true
 * isDirective('class') // returns false
 */
export function isDirective(name: string): boolean {
  return Object.values(DIRECTIVES).some(set => set.has(name));
}

/**
 * Determines if an attribute should be bound for reactivity
 * 
 * Not all attributes need to be bound for reactive updates. This function
 * decides which attributes should be tracked and updated when state changes.
 * 
 * Rules for binding:
 * 1. All directives are always bound (they control framework behavior)
 * 2. Form-related attributes (value, disabled, checked) are always bound
 *    because they commonly change based on state
 * 3. Class and style attributes are only bound if they contain expressions
 *    (static classes/styles don't need reactivity)
 * 4. All other attributes are only bound if they contain expressions
 * 
 * This optimization prevents unnecessary work for static attributes.
 * 
 * @param name - The attribute name
 * @param value - The attribute value (can be null)
 * @returns True if the attribute should be bound for reactivity
 * 
 * @example
 * shouldBindAttr('@if', 'condition') // returns true (directive)
 * shouldBindAttr('value', '{user.name}') // returns true (form attribute)
 * shouldBindAttr('class', 'static-class') // returns false (no expression)
 * shouldBindAttr('title', '{pageTitle}') // returns true (has expression)
 */
export function shouldBindAttr(name: string, value: string | null): boolean {
  if (isDirective(name)) return true;
  if (name === "value" || name === "disabled" || name === "checked") return true;
  if (name === "class" || name === "style") return hasBraces(value);
  return hasBraces(value);
}

/**
 * Checks if a value is a plain object (not an array, date, etc.)
 * 
 * This function determines if a value is a simple JavaScript object
 * created with {} or new Object(). It excludes arrays, dates, functions,
 * and instances of other classes.
 * 
 * This is useful when we need to handle objects differently from other
 * types, like when normalizing styles or classes.
 * 
 * @param value - The value to check
 * @returns True if the value is a plain object
 * 
 * @example
 * isPlainObject({}) // returns true
 * isPlainObject([]) // returns false
 * isPlainObject(new Date()) // returns false
 * isPlainObject(null) // returns false
 */
export function isPlainObject(value: any): boolean {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Parses props from a host element
 * 
 * Components can receive props in two ways:
 * 1. Via a "props" attribute containing JSON string
 * 2. Via individual attributes on the element
 * 
 * This function combines both sources into a single props object.
 * The props attribute takes precedence, but individual attributes
 * are still processed for non-props attributes.
 * 
 * Attribute name handling:
 * - "data-*" and "aria-*" attributes keep their original names
 * - Other attributes are converted to camelCase
 * - "use", "template", and "props" attributes are skipped (framework specials)
 * 
 * @param host - The host element to parse props from
 * @returns A record of prop names to coerced values
 * 
 * @example
 * // Given: <div props="{\"id\": 1}" data-role="admin" user-name="john"></div>
 * // Returns: { id: 1, dataRole: "admin", userName: "john" }
 */
export function parseProps(host: Element): Record<string, any> {
  let props: Record<string, any> = {};
  const raw = host.getAttribute("props");
  if (raw) {
    try { props = JSON.parse(raw); } catch { console.warn("impetus: invalid props JSON", raw); }
  }
  for (const { name, value } of Array.from(host.attributes)) {
    if (name === "use" || name === "template" || name === "props") continue;
    const key = name.startsWith("data-") || name.startsWith("aria-") ? name : toCamel(name);
    props[key] = coerce(value);
  }
  return props;
}

/**
 * Parses an @each expression to extract list, item, and index variables
 * 
 * The @each directive supports syntax like:
 * - "items" (uses default item and index names)
 * - "items as item" (specifies item name, uses default index)
 * - "items as item, index" (specifies both item and index names)
 * 
 * This function parses the expression and returns the three parts.
 * It provides sensible defaults if the "as" clause is omitted.
 * 
 * @param expr - The @each expression to parse
 * @returns An object with listExpr, itemKey, and idxKey properties
 * 
 * @example
 * parseEachExpression('users') // returns { listExpr: 'users', itemKey: 'item', idxKey: 'i' }
 * parseEachExpression('users as user') // returns { listExpr: 'users', itemKey: 'user', idxKey: 'i' }
 * parseEachExpression('users as user, idx') // returns { listExpr: 'users', itemKey: 'user', idxKey: 'idx' }
 */
export function parseEachExpression(expr: string): { listExpr: string; itemKey: string; idxKey: string } {
  const match = expr.match(/^(.*?)(?:\s+as\s+([a-zA-Z_$][\w$]*)(?:\s*,\s*([a-zA-Z_$][\w$]*))?)?$/);
  const listExpr = match && match[1] ? match[1] : expr;
  const itemKey = match && match[2] ? match[2] : 'item';
  const idxKey = match && match[3] ? match[3] : 'i';
  return {
    listExpr: listExpr.trim(),
    itemKey: itemKey.trim(),
    idxKey: idxKey.trim()
  };
}

/**
 * Sets a boolean property on an element
 * 
 * Some DOM properties are boolean (like disabled, checked, hidden).
 * This function safely sets these properties by converting the value
 * to a boolean. It's wrapped in a try-catch because some properties
 * might be read-only or throw errors for certain elements.
 * 
 * @param el - The element to set the property on
 * @param prop - The property name to set
 * @param value - The value to convert to boolean and set
 * 
 * @example
 * setBooleanProp(button, 'disabled', true) // button.disabled = true
 * setBooleanProp(checkbox, 'checked', false) // checkbox.checked = false
 */
export function setBooleanProp(el: Element, prop: string, value: any): void {
  try {
    (el as any)[prop] = Boolean(value);
  } catch {}
}

/**
 * Sets the value property on an element
 * 
 * Form elements have a "value" property that needs to be set as a string.
 * This function converts any value to a string (with null/undefined becoming
 * an empty string) and sets it on the element. It's wrapped in a try-catch
 * because not all elements support the value property.
 * 
 * @param el - The element to set the value on
 * @param value - The value to set (will be converted to string)
 * 
 * @example
 * setValueProp(input, 'hello') // input.value = 'hello'
 * setValueProp(input, 123) // input.value = '123'
 * setValueProp(input, null) // input.value = ''
 */
export function setValueProp(el: Element, value: any): void {
  try {
    (el as any).value = value == null ? "" : String(value);
  } catch {}
}

/**
 * Checks if an element is inside an @each template
 * 
 * Elements inside @each templates are handled differently because they
 * are part of a list that gets re-rendered when the list changes.
 * This function walks up the DOM tree to check if any parent element
 * has an @each directive.
 * 
 * This is important for avoiding duplicate event bindings and other
 * issues when elements are inside dynamically generated lists.
 * 
 * @param element - The element to check (can be null)
 * @returns True if the element is inside an @each template
 * 
 * @example
 * // Given: <div @each="items"><span>...</span></div>
 * // If element is the span, this returns true
 */
export function isInsideEachTemplate(element: Element | null): boolean {
  let current = element ? element.parentElement : null;
  while (current) {
    const hasAttr = typeof current.hasAttribute === 'function' ? current.hasAttribute.bind(current) : null;
    if (hasAttr && (hasAttr('s-each') || hasAttr('@each'))) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

/**
 * Finds the sibling element with an @else directive
 * 
 * The @if/@else directives work as a pair. When an @if condition is false,
 * we need to find and show the @else element. This function looks for the
 * immediate next sibling element that has an @else directive.
 * 
 * It only checks the immediate next sibling because @else must directly
 * follow its corresponding @if element to be considered a pair.
 * 
 * @param el - The element (usually with @if) to find the else sibling for
 * @returns The sibling element with @else, or null if not found
 * 
 * @example
 * // Given: <div @if="condition">...</div><div @else>...</div>
 * // If el is the @if div, this returns the @else div
 */
export function findElseSibling(el: Element): Element | null {
  const sibling = el.nextElementSibling;
  if (!sibling) return null;
  if (sibling.hasAttribute('s-else') || sibling.hasAttribute('@else')) return sibling;
  return null;
}
