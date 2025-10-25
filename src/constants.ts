/**
 * Constants used throughout the Impetus framework
 * 
 * This file contains all the constant values used by the framework.
 * Having constants in a central location makes them easy to maintain,
 * prevents magic strings scattered throughout the code, and provides
 * a single source of truth for framework configuration.
 */

/**
 * Set of HTML attributes that are boolean in nature
 * 
 * These attributes don't need a value - their presence alone means true.
 * For example, <input disabled> is the same as <input disabled="disabled">.
 * 
 * This set is used to determine how to handle these attributes when
 * setting them based on component state. If the value is truthy, the
 * attribute is added; if falsy, it's removed.
 * 
 * Note: Some attributes like "checked" and "selected" have special
 * handling because they're properties as well as attributes.
 */
export const BOOLEAN_ATTRS = new Set([
  "checked","disabled","readonly","required","open","selected","hidden",
  "autofocus","multiple","muted","playsinline","controls"
]);

/**
 * Set of HTML tag names that should be skipped during processing
 * 
 * These tags contain content that should not be processed by the framework:
 * - SCRIPT: Contains JavaScript code that shouldn't be parsed as templates
 * - STYLE: Contains CSS that shouldn't be processed
 * - TEMPLATE: Contains template fragments that should remain inert
 * 
 * Skipping these tags improves performance and prevents unintended
 * side effects from processing their content.
 */
export const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE"]);

/**
 * Collection of all framework directives
 * 
 * Directives are special attributes that control framework behavior.
 * Each directive has two variants: a prefixed version (s-*) and an
 * @ version (@*). Both work the same way, allowing developers to
 * choose their preferred syntax.
 * 
 * The directives are:
 * - IF: Conditionally renders elements (removes from DOM when false)
 * - SHOW: Shows/hides elements with CSS display (keeps in DOM)
 * - ELSE: Alternative content when IF condition is false
 * - EACH: Renders a list of items from an array
 * - TRANSITION: Applies transition effects when elements appear/disappear
 * 
 * Using a const assertion (as const) ensures the structure can't be
 * accidentally modified at runtime.
 */
export const DIRECTIVES = {
  IF: new Set(['s-if', '@if']),
  SHOW: new Set(['s-show', '@show']),
  ELSE: new Set(['s-else', '@else']),
  EACH: new Set(['s-each', '@each']),
  TRANSITION: new Set(['s-transition', '@transition'])
} as const;

/**
 * Placeholder strings used for temporary brace replacement
 * 
 * When processing templates, we need to handle escaped braces ({{ and }}).
 * These placeholders are used to temporarily replace escaped braces
 * during processing, then restore them afterward.
 * 
 * The null characters (\u0000) are used because they're unlikely to
 * appear in normal HTML content, ensuring the placeholders don't
 * conflict with actual text.
 * 
 * Example flow:
 * 1. "{{literal}}" becomes "\u0000LBRACE\u0000literal\u0000RBRACE\u0000"
 * 2. Process expressions (single braces)
 * 3. Replace placeholders back to double braces
 */
export const PLACEHOLDERS = {
  LBRACE: "\u0000LBRACE\u0000",
  RBRACE: "\u0000RBRACE\u0000"
} as const;
