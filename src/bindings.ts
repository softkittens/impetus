/**
 * IMPETUS FRAMEWORK - Data Bindings Module
 * 
 * This module finds and tracks all data bindings in component templates.
 * Bindings are connections between data (state) and the DOM (UI).
 * 
 * WHY THIS MODULE EXISTS:
 * - Scans templates to find where data is used
 * - Tracks attribute bindings like class="active ? 'active' : ''"
 * - Tracks text interpolations like "Hello {name}!"
 * - Enables efficient re-rendering by knowing what to update
 */

import type { Scope, AttrBinding, InterpBinding } from './types';
import { SKIP_TAGS, DIRECTIVES } from './constants';
import { hasBraces, isInsideEachTemplate } from './utils';
import { getMountComponent } from './runtime-api';

/**
 * BINDING STORAGE
 * 
 * WHY: We use WeakMaps to store bindings per component
 * WeakMaps prevent memory leaks when components are destroyed
 */
const attrBindings = new WeakMap<Element, AttrBinding[]>(); // Maps component root -> array of attribute bindings
const interpBindings = new WeakMap<Element, InterpBinding[]>(); // Maps component root -> array of text interpolation bindings

/**
 * MAIN BINDING COLLECTION FUNCTION
 * 
 * This function finds all data bindings in a component template
 * 
 * @param root - The component's root DOM element
 * 
 * WHY: We need to know where data is used so we can update the right parts
 * of the DOM when state changes. This is the foundation of reactive rendering.
 */
export function collectBindingsForRoot(root: Element): void {
  // STEP 1: Process template anchors
  // Template anchors are like <div template="my-template"></div>
  // They copy content from a <template> tag into the div
  collectTemplateAnchors(root);
  
  // STEP 2: Mount nested components
  // Components can contain other components with [use="ClassName"]
  // We need to initialize those child components too
  collectNestedComponents(root);
  
  // STEP 3: Find attribute bindings
  // These are things like class="{active}" or style="color: {color}"
  collectAttributeBindings(root);
  
  // STEP 4: Find text interpolations
  // These are things like "Hello {name}!" in text content
  collectTextInterpolations(root);
}

/**
 * TEMPLATE ANCHOR PROCESSING
 * 
 * Template anchors allow reusing template content in multiple places
 * 
 * @param root - The component root element
 * 
 * WHY: Templates let you define reusable HTML chunks
 * This is useful for things like modals, forms, or repeated content
 */
function collectTemplateAnchors(root: Element): void {
  // Find all elements with a "template" attribute
  const anchors = Array.from(root.querySelectorAll('[template]')) as Element[];
  
  for (const el of anchors) {
    const id = el.getAttribute('template');
    if (!id) continue;
    
    // Find the template element by ID
    const tpl = document.getElementById(id) as HTMLTemplateElement | null;
    if (tpl && tpl.tagName === 'TEMPLATE') {
      try {
        // Clear existing content and clone template content
        el.innerHTML = '';
        el.appendChild(tpl.content.cloneNode(true));
        
        // Remove the template attribute to avoid re-processing
        // WHY: We don't want to process this anchor again
        el.removeAttribute('template');
      } catch (e) {
        console.warn('impetus: failed to mount template anchor', id, e);
      }
    } else {
      console.warn('impetus: template anchor id not found', id);
    }
  }
}

/**
 * NESTED COMPONENT COLLECTION
 * 
 * Components can contain child components that need to be initialized
 * 
 * @param root - The component root element
 * 
 * WHY: Component composition is a key pattern in modern frameworks
 * Parent components need to initialize their children
 */
function collectNestedComponents(root: Element): void {
  // Find all elements with a "use" attribute (component hosts)
  const nestedHosts = Array.from(root.querySelectorAll('[use]:not(template):not(script)')) as Element[];
  
  for (const host of nestedHosts) {
    const className = (host.getAttribute('use') || '').trim();
    if (!className) continue;
    
    const inherit = host.hasAttribute('inherit');
    
    // Mount the nested component
    // WHY: Child components need their own state and bindings
    try {
      getMountComponent()(host, className, inherit);
    } catch {}
  }
}

/**
 * ATTRIBUTE BINDING COLLECTION
 * 
 * Attribute bindings connect data to HTML attributes
 * Examples: class="{active}", style="color: {color}", disabled="{!enabled}"
 * 
 * @param root - The component root element
 * 
 * WHY: Many UI patterns depend on dynamic attributes
 * CSS classes, styles, form states, etc. all need to react to data changes
 */
function collectAttributeBindings(root: Element): void {
  const abinds: AttrBinding[] = [];
  
  // Get all elements in this component (including the root)
  const all = [root, ...Array.from(root.querySelectorAll("*"))] as Element[];
  
  all.forEach((el) => {
    // Skip elements inside @each templates
    // WHY: @each templates are handled separately and shouldn't be processed here
    if (isInsideEachTemplate(el)) {
      return;
    }
    
    const attrs = Array.from(el.attributes);
    const hasEach = attrs.some(a => a.name === 's-each' || a.name === '@each');
    
    for (const { name, value } of attrs) {
      // Never treat event handlers as attribute bindings
      // WHY: Event handlers are handled separately in the events module
      if (name.startsWith('on')) continue;
      
      // Skip component infrastructure attributes
      // WHY: These are framework attributes, not data bindings
      if (name === 'props' || name === 'use' || name === 'template' || name === 'scope') continue;
      
      // Special handling for @each template holders
      // When an element has @each, only process the @each attribute itself
      if (hasEach && !(name === 's-each' || name === '@each') && !name.startsWith('on')) {
        continue;
      }
      
      /**
       * TWO-WAY DATA BINDING SHORTHAND
       * 
       * :value="expr" is shorthand for two-way binding
       * It creates both a value binding and a data-model binding
       */
      if (name === ':value') {
        abinds.push({ el, attr: 'value', expr: value || "" });
        try { 
          // Add data-model for two-way binding
          el.setAttribute('data-model', value || ''); 
          el.removeAttribute(name); // Remove the shorthand
        } catch {}
        continue;
      }
      
      // Regular value attribute with expressions
      if (name === 'value') {
        if (hasBraces(value)) {
          abinds.push({ el, attr: name, expr: value || "" });
        }
        continue;
      }
      
      // Check if this attribute should be bound to data
      if (shouldBindAttr(name, value)) {
        abinds.push({ el, attr: name, expr: value || "" });
      }
    }
  });
  
  // Store the bindings for this component
  attrBindings.set(root, abinds);
}

/**
 * TEXT INTERPOLATION COLLECTION
 * 
 * Text interpolations are expressions inside text content
 * Example: "Hello {name}! You have {count} messages."
 * 
 * @param root - The component root element
 * 
 * WHY: Most UI text contains dynamic data
 * Names, counts, dates, etc. need to update when state changes
 */
function collectTextInterpolations(root: Element): void {
  const textBindings: InterpBinding[] = [];
  
  // Use TreeWalker when available; otherwise, fall back to scanning element textContent
  const createTreeWalker = (document as any).createTreeWalker;
  if (typeof createTreeWalker === 'function') {
    const nodeFilter = (globalThis as any).NodeFilter;
    const SHOW_TEXT = nodeFilter && typeof nodeFilter.SHOW_TEXT === 'number'
      ? nodeFilter.SHOW_TEXT
      : 4;
    const walker = createTreeWalker.call(document, root, SHOW_TEXT as any);
    let node: Node | null = walker.nextNode();
    while (node) {
      const textNode = node as Text;
      const parent = textNode.parentElement;
      if (parent && 
          !SKIP_TAGS.has(parent.tagName) &&
          !isInsideEachTemplate(parent) &&
          !(parent.hasAttribute('s-each') || parent.hasAttribute('@each'))) {
        if (textNode.nodeValue && /\{[^}]+\}/.test(textNode.nodeValue)) {
          textBindings.push({ node: textNode, template: textNode.nodeValue });
        }
      }
      node = (walker as any).nextNode();
    }
  } else {
    const all = [root, ...Array.from(root.querySelectorAll('*'))] as Element[];
    for (const el of all) {
      if (SKIP_TAGS.has(el.tagName)) continue;
      if (isInsideEachTemplate(el)) continue;
      if (el.hasAttribute('s-each') || el.hasAttribute('@each')) continue;
      const txt = el.textContent;
      if (typeof txt === 'string' && /\{[^}]+\}/.test(txt)) {
        textBindings.push({ node: el as any, template: txt });
      }
    }
  }
  interpBindings.set(root, textBindings);
}

/**
 * ATTRIBUTE BINDING DECISION HELPER
 * 
 * This function decides if an attribute should be treated as a data binding
 * 
 * @param name - The attribute name
 * @param value - The attribute value
 * @returns True if this attribute should be bound to data
 * 
 * WHY: Not all attributes are data bindings
 * We need to distinguish between static attributes and dynamic ones
 */
function shouldBindAttr(name: string, value: string | null): boolean {
  // Check if it's a known directive attribute
  // Directives are special framework attributes like @if, @show, etc.
  if (Object.values(DIRECTIVES).some(set => set.has(name))) return true;
  
  // Always bind these common form attributes
  if (name === "value" || name === "disabled" || name === "checked") return true;
  
  // For class and style, only bind if they contain expressions
  // WHY: Static class/style attributes don't need to be reactive
  if (name === "class" || name === "style") return hasBraces(value);
  
  // For everything else, bind only if it contains expressions
  return hasBraces(value);
}

/**
 * BINDING ACCESSOR FUNCTIONS
 * 
 * These functions provide access to the collected bindings
 */

/**
 * Gets all attribute bindings for a component
 * @param root - The component root element
 * @returns Array of attribute bindings
 * 
 * WHY: The render system needs to know what attributes to update
 */
export function getAttributeBindings(root: Element): AttrBinding[] {
  return attrBindings.get(root) || [];
}

/**
 * Gets all text interpolation bindings for a component
 * @param root - The component root element
 * @returns Array of interpolation bindings
 * 
 * WHY: The render system needs to know what text to update
 */
export function getInterpolationBindings(root: Element): InterpBinding[] {
  return interpBindings.get(root) || [];
}

/**
 * Clears all bindings for a component
 * @param root - The component root element
 * 
 * WHY: When components are destroyed, we need to clean up
 * This prevents memory leaks and stale references
 */
export function clearBindings(root: Element): void {
  attrBindings.delete(root);
  interpBindings.delete(root);
}
