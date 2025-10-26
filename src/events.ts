/**
 * IMPETUS FRAMEWORK - Event Handling Module
 * 
 * This module handles user interactions like clicks, form inputs, and keyboard events,
 * wiring inline `on*` attributes to real event listeners.
 * 
 * WHY THIS MODULE EXISTS:
 * - Makes components interactive by handling user events
 * - Supports two-way data binding for forms
 * - Provides event modifiers like `.prevent`, `.stop`, `.once`
 * - Exposes ergonomic `$event` helpers in expressions:
 *   - `$event.outside` → true if the event target (or focusout relatedTarget) is outside the bound element
 *   - Key aliases with chaining: `$event.escape.prevent.stop && close()` (also: enter, space, tab, backspace)
 * - Attaches listeners to `document` for global cases (e.g., keydown, outside) to ensure consistent behavior
 * - Cleans up event listeners to prevent memory leaks
 */

import type { Scope, EventHandler } from './types';
import { evalInScope, execInScope, assignInScope } from './expression';
import { stateManager } from './state';
import { getDevtoolsHooks } from './devtools-hooks';
import { getRenderBindings } from './runtime-api';
import { isInsideEachTemplate } from './utils';

/**
 * EVENT LISTENER STORAGE
 * 
 * WHY: We need to track all event listeners so we can remove them later
 * This prevents memory leaks when components are destroyed
 */
const listenerMap = new WeakMap<Element, EventHandler[]>(); // Maps component root -> array of event listeners

/**
 * MAIN EVENT WIRING FUNCTION
 * 
 * This function sets up all event handlers for a component
 * 
 * @param root - The component's root DOM element
 * @param state - The component state object
 * 
 * WHY: Components need to respond to user interactions
 * This function finds all event attributes and sets up the appropriate handlers
 */
export function wireEventHandlers(root: Element, state: Scope): EventHandler[] {
  const listeners: EventHandler[] = [];
  
  // Get all elements in this component (including the root)
  const all = [root, ...Array.from(root.querySelectorAll("*"))] as Element[];
  
  all.forEach((el) => {
    /**
     * SKIP CHILD COMPONENTS
     * 
     * If an element has its own state (is a child component),
     * don't wire events for it - it handles its own events
     */
    const mapped = stateManager.getRootState(el);
    if (mapped && mapped !== state && el !== root) {
      return; // Child element managed by different scope
    }
    
    /**
     * SKIP @each TEMPLATE HOLDERS AND THEIR DESCENDANTS
     * 
     * Elements with @each are template holders, not real elements
     * and anything inside them will be cloned. Do not wire events here
     * or remove inline attributes, or clones will lose handlers.
     */
    if (el.hasAttribute('s-each') || el.hasAttribute('@each') || isInsideEachTemplate(el)) {
      return;
    }
    
    /**
     * WIRE TWO-WAY DATA BINDING
     * 
     * If the element has data-model attribute, set up two-way binding
     * This automatically syncs form values with component state
     */
    if (el.hasAttribute('data-model')) {
      wireModelBinding(el, state, root, listeners);
    }
    
    /**
     * WIRE EVENT HANDLERS
     * 
     * Process onclick, oninput, onsubmit, etc. attributes
     */
    wireEventListeners(el, state, root, listeners);
  });
  
  // Store the listeners for cleanup later
  if (listeners.length) listenerMap.set(root, listeners);
  
  // Notify devtools about event wiring
  try {
    const hooks = getDevtoolsHooks();
    if (hooks && typeof hooks.onWireEvents === 'function') {
      hooks.onWireEvents(root, listeners.length);
    }
  } catch {}
  
  return listeners;
}

/**
 * TWO-WAY DATA BINDING
 * 
 * This function sets up automatic synchronization between form elements and state
 * 
 * @param el - The form element
 * @param state - The component state
 * @param root - The component root
 * @param listeners - Array to add the event listener to
 * 
 * WHY: Two-way binding is a core feature of modern frameworks
 * It eliminates boilerplate code for form handling
 */
function wireModelBinding(el: Element, state: Scope, root: Element, listeners: EventHandler[]): void {
  const path = el.getAttribute('data-model') || '';
  const tag = el.tagName;
  
  // Determine which event to listen for based on element type
  let evt = 'input';
  if (tag === 'SELECT') evt = 'change'; // Select elements use change event
  if (tag === 'INPUT') {
    const typ = (el as HTMLInputElement).type;
    if (typ === 'checkbox' || typ === 'radio') evt = 'change'; // Checkboxes use change event
  }
  
  /**
   * CREATE THE EVENT HANDLER
   * 
   * This handler updates state when the form element changes
   */
  const handler = (ev: Event) => {
    const t = ev.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    let newValue: any;
    
    // Extract the appropriate value based on element type
    if (t instanceof HTMLInputElement && t.type === 'checkbox') {
      newValue = t.checked; // Checkboxes use checked property
    } else if (t instanceof HTMLInputElement && (t.type === 'number' || t.type === 'range')) {
      // Number inputs: convert to number, but keep empty string as empty
      newValue = t.value === '' ? '' : Number(t.value);
    } else {
      newValue = (t as any).value; // Text inputs, textareas, selects
    }
    
    // Update the state with the new value
    assignInScope(path, state, newValue);
    
    // Schedule a re-render to update the UI
    stateManager.scheduleRender(root);
  };
  
  // Add the event listener
  el.addEventListener(evt, handler as EventListener);
  listeners.push({ el: el as any, event: evt, handler: handler as EventListener });
}

/**
 * EVENT LISTENER WIRING
 * 
 * This function processes event attributes like onclick, oninput, etc.
 * 
 * @param el - The DOM element
 * @param state - The component state
 * @param root - The component root
 * @param listeners - Array to add event listeners to
 * 
 * WHY: Event attributes connect user actions to component methods
 * This is how components become interactive
 */
function wireEventListeners(el: Element, state: Scope, root: Element, listeners: EventHandler[]): void {
  // Process all attributes on this element
  for (const { name, value } of Array.from(el.attributes)) {
    // Only process event attributes (starts with "on" and has more characters)
    if (name.startsWith("on") && name.length > 2) {
      /**
       * PARSE EVENT NAME AND MODIFIERS
       * 
       * onclick.prevent.stop -> event="click", mods=["prevent", "stop"]
       * Modifiers change how the event behaves
       */
      const parts = name.slice(2).split('.'); // Remove "on" prefix
      const event = parts[0] as string; // The actual event name
      const mods = new Set(parts.slice(1)); // Modifiers like prevent, stop, once
      
      // Key alias filters via modifiers (e.g., onkeydown.escape)
      const keyAliases: Record<string, string> = {
        escape: 'Escape',
        enter: 'Enter',
        space: ' ',
        tab: 'Tab',
        backspace: 'Backspace'
      };
      const keyFilters = Array.from(mods).filter(m => m in keyAliases) as Array<keyof typeof keyAliases>;

      // Check if this event needs special handling
      const needsOutside = (value || '').includes('$event.outside') || mods.has('outside'); // outside via value or modifier
      const isGlobalKey = event === 'keydown'; // Global keyboard events
      const target: EventTarget = (needsOutside || isGlobalKey) ? document : el;
      
      /**
       * CREATE THE EVENT HANDLER
       * 
       * This handler executes the event expression and handles modifiers
       */
      const handler = (ev: Event) => {
        // Apply key filters first for keyboard events
        if ((event === 'keydown' || event === 'keyup' || event === 'keypress') && keyFilters.length) {
          const e = ev as KeyboardEvent;
          const ok = keyFilters.some(k => e.key === keyAliases[k]);
          if (!ok) return;
        }

        // Apply event modifiers
        if (mods.has('prevent')) { try { ev.preventDefault(); } catch {} }
        if (mods.has('stop')) { try { ev.stopPropagation(); } catch {} }
        
        /**
         * CREATE WRAPPED EVENT OBJECT
         * 
         * We wrap the event object to add special properties
         * like $event.outside for click-outside detection
         */
        let wrapped: any;
        const chainFlags = { prevent: false, stop: false };
        wrapped = new Proxy(ev as any, {
          get(t, p) {
            // Special handling for $event.outside
            if (p === 'outside') {
              const e: any = ev as any;
              if (e && e.type === 'focusout') {
                const next: Node | null = (e as FocusEvent).relatedTarget as any || null;
                return !next || !el.contains(next);
              }
              const tgt: Node | null = (ev.target as any) || null;
              return !tgt || !el.contains(tgt);
            }

            // Modifiers-first chaining support: $event.prevent.stop.enter
            if (p === 'prevent') { chainFlags.prevent = true; return wrapped; }
            if (p === 'stop') { chainFlags.stop = true; return wrapped; }

            // Key alias booleans: $event.enter, $event.escape, etc.
            if (p === 'escape' || p === 'enter' || p === 'space' || p === 'tab' || p === 'backspace') {
              const e = ev as KeyboardEvent;
              let ok = false;
              switch (String(p)) {
                case 'escape': ok = (e.key === 'Escape'); break;
                case 'enter': ok = (e.key === 'Enter'); break;
                case 'space': ok = (e.key === ' ' || e.key === 'Spacebar'); break;
                case 'tab': ok = (e.key === 'Tab'); break;
                case 'backspace': ok = (e.key === 'Backspace'); break;
              }
              if (ok) {
                if (chainFlags.prevent) { try { ev.preventDefault(); } catch {} }
                if (chainFlags.stop) { try { ev.stopPropagation(); } catch {} }
              }
              return ok;
            }

            // One-off helpers fallback without optional chaining
            if (p === 'preventDefault') {
              const fn = (ev as any).preventDefault;
              return typeof fn === 'function' ? fn.bind(ev) : undefined;
            }
            if (p === 'stopPropagation') {
              const fn = (ev as any).stopPropagation;
              return typeof fn === 'function' ? fn.bind(ev) : undefined;
            }

            // Normal property access with proper function binding
            // @ts-ignore - TypeScript doesn't know about event properties
            const v = (t as any)[p];
            return typeof v === 'function' ? v.bind(t) : v;
          }
        });
        
        // Key filters for keyboard events
        if ((event === 'keydown' || event === 'keyup' || event === 'keypress') && keyFilters.length) {
          const e = ev as KeyboardEvent;
          const ok = keyFilters.some(k => e.key === keyAliases[k]);
          if (!ok) return;
        }

        // Execute the event expression in component context
        const result = execInScope(value, state, wrapped as any);
        
        // Schedule a re-render in case the event changed state
        stateManager.scheduleRender(root);
        // Immediate render fallback to ensure visible updates
        try { getRenderBindings()(state, root); } catch {}
        
        // Return the result for testing (optional)
        return result;
      };
      
      /**
       * DETERMINE EVENT LISTENER OPTIONS
       * 
       * Different events need different listener options
       */
      // Use capture only for outside click to ensure it fires before element handlers
      const useCapture = needsOutside ? true : false;
      let opts: boolean | AddEventListenerOptions | undefined;
      
      if (mods.has('once') && useCapture) opts = { capture: true, once: true };
      else if (mods.has('once')) opts = { once: true };
      else if (useCapture) opts = true; // Boolean capture shorthand
      
      // Add the event listener
      target.addEventListener(event, handler as EventListener, opts);
      listeners.push({ el: target as any, event, handler: handler as EventListener });
      // Reliability: for checkbox/radio using inline onchange, also listen to click and input
      try {
        if (event === 'change' && el.tagName === 'INPUT') {
          const typ = (el as HTMLInputElement).type;
          if (typ === 'checkbox' || typ === 'radio') {
            el.addEventListener('click', handler as EventListener);
            listeners.push({ el: el as any, event: 'click', handler: handler as EventListener });
            el.addEventListener('input', handler as EventListener);
            listeners.push({ el: el as any, event: 'input', handler: handler as EventListener });
          }
        }
      } catch {}
      
      // Remove the inline attribute to avoid global-scope eval
      // WHY: Prevents the browser from evaluating the attribute as JavaScript
      try { el.removeAttribute(name); } catch {}
    }
  }
}

/**
 * EVENT CLEANUP FUNCTION
 * 
 * This function removes all event listeners for a component
 * 
 * @param root - The component root element
 * 
 * WHY: When components are destroyed, we must clean up event listeners
 * Otherwise they'll keep references to the component and cause memory leaks
 */
export function removeEventListeners(root: Element): void {
  const listeners = listenerMap.get(root) || [];
  
  // Remove each event listener
  for (const { el, event, handler } of listeners) {
    el.removeEventListener(event, handler);
  }
  
  // Clear the listener map for this component
  listenerMap.delete(root);
}
