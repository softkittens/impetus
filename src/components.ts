/**
 * IMPETUS FRAMEWORK - Component System Module
 * 
 * This module handles class-based components with lifecycle methods.
 * Components are reusable pieces of UI with their own state and behavior.
 * 
 * WHY THIS MODULE EXISTS:
 * - Enables object-oriented component architecture
 * - Provides lifecycle hooks (onMount, onDestroy)
 * - Supports component inheritance and props
 * - Manages component instances and templates
 */

import type { Scope } from './types';
import { resolveCtor } from './expression';
import { parseProps } from './utils';
import { stateManager } from './state';

/**
 * COMPONENT INSTANCE TRACKING
 * 
 * WHY: We need to track component instances for lifecycle management
 * WeakMaps prevent memory leaks when components are destroyed
 */
const componentInstance = new WeakMap<Element, any>(); // Maps host element -> component instance
const initialized = new WeakSet<Element>(); // Tracks which hosts are initialized

/**
 * MAIN COMPONENT MOUNTING FUNCTION
 * 
 * This function creates and initializes a component instance
 * 
 * @param host - The host DOM element (where the component will be mounted)
 * @param className - The name of the component class
 * @param inherit - Whether to inherit parent state instead of creating a new instance
 * 
 * WHY: This is the entry point for the component system
 * It handles component creation, template resolution, and initialization
 */
export function mountComponent(host: Element, className: string, inherit: boolean): void {
  // Prevent double initialization
  if (initialized.has(host)) return;
  
  // Find the component constructor function
  const ctor = resolveCtor(className);
  if (typeof ctor !== 'function') {
    console.warn('impetus: constructor not found for', className);
    return;
  }
  
  // Parse props from the host element
  const props = parseProps(host);
  let instance: any;
  
  /**
   * COMPONENT INSTANCE CREATION
   * 
   * Components can either create their own instance
   * or inherit state from a parent component
   */
  if (inherit) {
    /**
     * INHERITANCE MODE
     * 
     * The component shares state with its parent
     * This is useful for nested components that need access to parent data
     */
    let par: Element | null = host.parentElement;
    let inherited: Scope | undefined;
    
    // Walk up the DOM tree to find parent with state
    while (par && !inherited) {
      const s = stateManager.getRootState(par as Element);
      if (s) inherited = s;
      par = par.parentElement;
    }
    
    if (!inherited) {
      console.warn('impetus: inherit requested but no parent state found for', className);
      try { instance = new ctor(props); } catch { instance = {}; }
    } else {
      instance = inherited; // Use parent state instead of creating new instance
    }
  } else {
    /**
     * NORMAL MODE
     * 
     * Create a new component instance with its own state
     */
    try { 
      instance = new ctor(props); 
    } catch (e) {
      console.warn('impetus: error constructing', className, e);
      instance = {}; // Fallback to empty object if construction fails
    }
  }
  
  /**
   * TEMPLATE RESOLUTION
   * 
   * Find and apply the component's template
   * Templates can be specified in multiple ways:
   * 1. host element attribute: <div use="MyComp" template="my-template"></div>
   * 2. static class property: class MyComp { static template = 'my-template' }
   * 3. instance property: constructor() { this.template = 'my-template' }
   */
  resolveTemplate(host, ctor, instance);
  
  // Mark the host as initialized
  initialized.add(host);
  
  // Set reference to host element on component instance (for non-inherited components)
  if (!inherit) { try { (instance as any).$el = host; } catch {} }
  
  /**
   * GLOBAL STORE SETUP
   * 
   * Ensure components have access to the shared global store
   * This allows components to share data across the entire app
   */
  try { 
    (instance as any).$store = (window as any).makeReactive?.(
      (globalThis as any).__impetusStore || ((globalThis as any).__impetusStore = {}), 
      host
    ); 
  } catch {}
  
  /**
   * REACTIVE STATE SETUP
   * 
   * Make the component instance reactive so UI updates when state changes
   */
  const reactive = (window as any).makeReactive?.(instance, host, true);
  stateManager.setRootState(host, reactive);
  
  // Store the original instance for lifecycle methods (non-inherited components only)
  if (!inherit) componentInstance.set(host, instance);
  
  // Notify devtools about component initialization
  try { (window as any).devhooks?.onInitRoot?.(host, reactive); } catch {}
  
  // Register the component with the state manager
  stateManager.addRoot(host);
  
  /**
   * COMPONENT INITIALIZATION SEQUENCE
   * 
   * This is the standard initialization order for all components:
   * 1. Collect data bindings
   * 2. Perform initial render
   * 3. Wire event handlers
   * 4. Call onMount lifecycle hook
   */
  
  // STEP 1: Find and track all data bindings in the template
  (window as any).collectBindingsForRoot?.(host);
  
  // STEP 2: Render the component with its initial state
  (window as any).renderBindings?.(reactive, host);
  
  // STEP 3: Set up event handlers for user interactions
  (window as any).wireEventHandlers?.(host, reactive);
  
  // STEP 4: Call the component's onMount lifecycle hook
  if (!inherit) { 
    try { 
      instance?.onMount?.call(reactive, host); 
    } catch {} 
  }
}

/**
 * TEMPLATE RESOLUTION FUNCTION
 * 
 * This function finds and applies the appropriate template for a component
 * 
 * @param host - The host DOM element
 * @param ctor - The component constructor
 * @param instance - The component instance
 * 
 * WHY: Templates separate structure from behavior
 * They allow components to have reusable HTML layouts
 */
function resolveTemplate(host: Element, ctor: any, instance: any): void {
  // Check for template in order of precedence:
  // 1. Host element attribute (highest priority)
  // 2. Static class property
  // 3. Instance property (lowest priority)
  const hostTpl = host.getAttribute('template');
  const staticTpl = (ctor as any).template;
  const instTpl = instance?.template;
  const tplId = hostTpl || staticTpl || instTpl;
  
  if (tplId) {
    // Find the template element by ID
    const tplEl = document.getElementById(String(tplId)) as HTMLTemplateElement | null;
    if (tplEl && tplEl.tagName === 'TEMPLATE') {
      // Clear existing content and clone template content
      host.innerHTML = '';
      host.appendChild(tplEl.content.cloneNode(true));
    } else {
      console.warn('impetus: template id not found', tplId);
    }
  }
}

/**
 * COMPONENT STATE CHECKING
 * 
 * @param host - The host DOM element
 * @returns True if the component is initialized
 * 
 * WHY: Prevents double initialization and allows checking component state
 */
export function isComponentInitialized(host: Element): boolean {
  return initialized.has(host);
}

/**
 * COMPONENT INSTANCE ACCESS
 * 
 * @param host - The host DOM element
 * @returns The component instance or undefined
 * 
 * WHY: Allows external access to component methods and properties
 * Useful for testing and debugging
 */
export function getComponentInstance(host: Element): any {
  return componentInstance.get(host);
}

/**
 * COMPONENT DESTRUCTION
 * 
 * This function cleans up a component when it's removed from the DOM
 * 
 * @param host - The host DOM element
 * 
 * WHY: Proper cleanup prevents memory leaks
 * Components need to release resources and unregister event listeners
 */
export function destroyComponent(host: Element): void {
  // Call the component's onDestroy lifecycle hook
  try { 
    (componentInstance.get(host) as any)?.onDestroy?.(); 
  } catch {} // Silently ignore errors in onDestroy
  
  // Clean up tracking data
  componentInstance.delete(host);
  initialized.delete(host);
}
