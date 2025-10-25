/**
 * IMPETUS FRAMEWORK - Main Entry Point
 * 
 * This is the central file that orchestrates the entire framework.
 * Think of it as the "conductor" that tells all other modules when to play.
 * 
 * WHY THIS FILE EXISTS:
 * - Provides a single entry point for the entire framework
 * - Sets up global references so modules can talk to each other
 * - Initializes components and manages their lifecycle
 * - Handles the main initialization logic
 */

// TypeScript declaration for devtools flag
// This tells TypeScript that DEVTOOLS might exist as a global constant
declare const DEVTOOLS: boolean;

// Import all the core modules we need
// Each import brings in specific functionality:
import type { Scope } from './types';           // Type definitions for better code safety
import { stateManager } from './state';         // Manages component state (data)
import { makeReactive } from './state';         // Makes data reactive (updates UI when changed)
import { evalInScope, invalidateComputedCache } from './expression'; // Evaluates expressions like {name}
import { collectBindingsForRoot, clearBindings } from './bindings';   // Finds and tracks data bindings
import { renderBindings } from './render';      // Updates the DOM when data changes
import { wireEventHandlers, removeEventListeners } from './events';   // Handles user interactions (clicks, inputs)
import { mountComponent, destroyComponent } from './components';     // Manages component lifecycle
import { applyTransition } from './transitions'; // Handles animations and transitions

/**
 * DEVTOOLS INTEGRATION
 * 
 * WHY: We need hooks for devtools but don't want to break the app if devtools aren't loaded
 * This pattern provides "graceful degradation" - the app works with or without devtools
 */
// Devtools hooks - stubs when devtools not loaded
let devhooks: any = undefined;

/**
 * Sets up devtools hooks if devtools are available
 * @param hooks - Object containing devtools callback functions
 * 
 * WHY: Allows devtools to hook into framework lifecycle events
 * This enables debugging and inspection capabilities
 */
export function setDevtoolsHooks(hooks: any): void {
  devhooks = Object.assign({}, devhooks, hooks);
}

/**
 * Gets the current devtools hooks
 * @returns The devtools hooks object or undefined
 * 
 * WHY: Provides access to devtools functionality throughout the framework
 */
export function getDevtoolsHooks(): any {
  return devhooks;
}

/**
 * STUB FUNCTIONS FOR DEVTOOLS
 * 
 * WHY: These functions prevent crashes when devtools aren't loaded
 * They return empty/default values so the framework continues working
 */
export function __dev_get_roots(): Element[] { return []; }
export function __dev_get_state(root: Element): any { return undefined; }
export function __dev_get_bindings(root: Element): { attrs: any[]; interps: any[] } {
  return { attrs: [], interps: [] };
}

/**
 * GLOBAL API SETUP
 * 
 * WHY: We expose core functions globally for two reasons:
 * 1. External code can access Impetus functionality
 * 2. Different modules can communicate without circular imports
 * 
 * This is like creating a "public API" for the framework
 */
const impetus = {
  stateManager,        // Manages state for all components
  makeReactive,        // Creates reactive objects
  evalInScope,         // Evaluates expressions in component context
  init,               // Initializes the framework
  destroy,            // Cleans up components
  mountComponent,     // Mounts component instances
  applyTransition,    // Applies animations
  renderBindings,     // Renders data to DOM
  devhooks: getDevtoolsHooks() // Devtools integration
};

// Make impetus available globally (window.impetus)
// WHY: Allows external access and enables debugging from browser console
(window as any).impetus = impetus;

/**
 * LEGACY GLOBAL REFERENCES
 * 
 * WHY: These maintain backward compatibility with older code
 * Some parts of the framework still reference these globals directly
 * 
 * NOTE: In a perfect world, we'd use only the impetus object above
 * But we keep these for compatibility with existing code
 */
(window as any).stateManager = stateManager;
(window as any).makeReactive = makeReactive;
(window as any).collectBindingsForRoot = collectBindingsForRoot;
(window as any).renderBindings = renderBindings;
(window as any).wireEventHandlers = wireEventHandlers;
(window as any).mountComponent = mountComponent;
(window as any).destroy = destroy;
(window as any).applyTransition = applyTransition;
(window as any).devhooks = getDevtoolsHooks();

/**
 * CIRCULAR DEPENDENCY FIX
 * 
 * WHY: stateManager needs renderBindings, but renderBindings needs stateManager
 * This creates a circular import problem. We solve it by injecting the function
 * after both modules are loaded.
 */
(stateManager as any).renderBindings = renderBindings;

/**
 * COMPONENT SETUP FUNCTION
 * 
 * This function sets up a single component with its state and bindings
 * 
 * @param root - The DOM element that represents the component root
 * 
 * WHY: Each component needs:
 * 1. Initial state data
 * 2. Reactive state management
 * 3. Global store access
 * 4. Data binding collection
 * 5. Initial rendering
 * 6. Event handler setup
 */
function setupScope(root: Element): void {
  // STEP 1: Parse initial state from the "scope" attribute
  // The scope attribute contains JSON data like: scope="{'name': 'John', 'age': 25}"
  const attr = root.getAttribute("scope");
  let initial: Scope = {}; // Default to empty object if no scope attribute
  
  if (attr && attr.trim()) {
    try {
      initial = JSON.parse(attr);
    } catch (e) {
      // If JSON is invalid, warn and use empty object
      console.warn("impetus: invalid scope JSON", e);
      initial = {};
    }
  }

  // STEP 2: Prevent double initialization
  // WHY: We don't want to setup the same component multiple times
  // This would cause memory leaks and duplicate event listeners
  if (stateManager.isInitialized(root)) return;
  stateManager.markInitialized(root);

  // STEP 3: Create reactive state
  // WHY: Reactive state automatically updates the UI when data changes
  // The 'true' parameter makes this a root-level state object
  const state = makeReactive(initial, root, true);
  stateManager.setRootState(root, state);
  
  // STEP 4: Setup global store access
  // WHY: Components need access to shared data across the app
  // The $store property provides this shared state
  try { 
    (state as any).$store = makeReactive(
      (globalThis as any).__impetusStore || ((globalThis as any).__impetusStore = {}), 
      root
    ); 
  } catch {} // Silently fail if store setup fails
  
  // STEP 5: Notify devtools that a component was initialized
  try { getDevtoolsHooks()?.onInitRoot?.(root, state); } catch {}
  
  // STEP 6: Register the component with the state manager
  // WHY: The state manager needs to track all active components
  stateManager.addRoot(root);

  // STEP 7: Find and collect all data bindings
  // WHY: We need to know where data is used in the template
  // This includes things like {name} in text or attr="value" in attributes
  collectBindingsForRoot(root);

  // STEP 8: Perform initial render
  // WHY: Render the component with its initial data
  // This displays the component in its initial state
  renderBindings(state, root);

  // STEP 9: Setup event handlers
  // WHY: Handle user interactions like clicks, form inputs, etc.
  // This makes the component interactive
  wireEventHandlers(root, state);
}

/**
 * MAIN INITIALIZATION FUNCTION
 * 
 * This is the function that kicks off the entire framework
 * 
 * @param selector - CSS selector to find components (default: "[scope]")
 * 
 * WHY: We need to find all components on the page and initialize them
 * This is typically called once when the page loads
 */
export function init(selector: string = "[scope]"): void {
  // Don't run on server-side (SSR)
  if (typeof document === "undefined") return;
  
  // STEP 1: Find and initialize scope-based components
  // These are components with a "scope" attribute
  const nodes = Array.from(document.querySelectorAll(selector));
  nodes.forEach((n) => setupScope(n as Element));

  // STEP 2: Find and initialize class-based components
  // These are components with a "use" attribute (newer API)
  const hosts = Array.from(
    document.querySelectorAll('[use]:not(template):not(script)')
  ) as Element[];
  
  // Mount each component class
  for (const host of hosts) {
    const className = (host.getAttribute('use') || '').trim();
    if (!className) continue; // Skip if no class name
    const inherit = host.hasAttribute('inherit'); // Check for inheritance
    mountComponent(host, className, inherit);
  }
}

/**
 * COMPONENT CLEANUP FUNCTION
 * 
 * This function properly cleans up a component when it's removed
 * 
 * @param root - The component root element to clean up
 * 
 * WHY: Proper cleanup prevents memory leaks and removes event listeners
 * This is crucial for single-page applications where components are added/removed
 */
export function destroy(root: Element): void {
  // STEP 1: Remove all event listeners
  // WHY: Prevents memory leaks from dangling event listeners
  removeEventListeners(root);
  
  // STEP 2: Clear all bindings and state marks
  // WHY: Removes references to the component from internal tracking
  clearBindings(root);
  stateManager.removeRoot(root);
  
  // STEP 3: Destroy component instance if it's a class component
  // WHY: Calls the component's destroy method for cleanup
  destroyComponent(root);
  
  // STEP 4: Notify devtools that component was destroyed
  try { getDevtoolsHooks()?.onDestroy?.(root); } catch {}
}

/**
 * RE-EXPORTS FOR EXTERNAL USE
 * 
 * WHY: These are commonly used functions that external code might need
 * Re-exporting them makes them available from the main entry point
 */
export { makeReactive } from './state';
export { evalInScope } from './expression';

/**
 * TYPE EXPORTS
 * 
 * WHY: Makes TypeScript types available for external developers
 * This enables better type safety and IDE autocomplete
 */
export type { Scope, DevtoolsHooks } from './types';

/**
 * AUTO-INITIALIZATION SUPPORT
 * 
 * WHY: Allows the framework to auto-initialize without manual init() call
 * Usage: <script type="module" src="./impetus.js" defer init></script>
 * 
 * The "init" attribute on the script tag triggers automatic initialization
 */
if (typeof document !== 'undefined') {
  const script = document.querySelector('script[type="module"][init]');
  if (script) {
    // Use queueMicrotask to ensure DOM is ready
    queueMicrotask(async () => {
      const { init } = await import('./index');
      init();
    });
  }
}

/**
 * DEVTOOLS CONDITIONAL LOADING
 * 
 * WHY: Devtools add bundle size and should only load in development
 * The DEVTOOLS constant is set during the build process
 * 
 * This pattern keeps production builds small and fast
 */
if (typeof DEVTOOLS !== 'undefined' && DEVTOOLS === true) {
  console.log('[impetus] devtools enabled');
  // Use the simple, reliable devtools
  import('./devtools').catch(() => {});
}
