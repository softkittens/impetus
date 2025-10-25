declare const DEVTOOLS: boolean;

// Main entry point - orchestrates all modules
import type { Scope } from './types';
import { stateManager } from './state';
import { makeReactive } from './state';
import { evalInScope, invalidateComputedCache } from './expression';
import { collectBindingsForRoot, clearBindings } from './bindings';
import { renderBindings } from './render';
import { wireEventHandlers, removeEventListeners } from './events';
import { mountComponent, destroyComponent } from './components';
import { applyTransition } from './transitions';
import { getDevtoolsHooks } from './devtools';

// Setup global references for cross-module communication and external access
const impetus = {
  stateManager,
  makeReactive,
  evalInScope,
  init,
  destroy,
  mountComponent,
  applyTransition,
  devhooks: getDevtoolsHooks()
};

// Make available globally for external use and cross-module communication
(window as any).impetus = impetus;

// Restore necessary global references for component system compatibility
(window as any).stateManager = stateManager;
(window as any).makeReactive = makeReactive;
(window as any).collectBindingsForRoot = collectBindingsForRoot;
(window as any).renderBindings = renderBindings;
(window as any).wireEventHandlers = wireEventHandlers;
(window as any).mountComponent = mountComponent;
(window as any).destroy = destroy;
(window as any).applyTransition = applyTransition;
(window as any).devhooks = getDevtoolsHooks();

// Inject renderBindings into stateManager to avoid circular dependency
(stateManager as any).renderBindings = renderBindings;

function setupScope(root: Element): void {
  // Parse scope JSON if provided, else empty object
  const attr = root.getAttribute("scope");
  let initial: Scope = {};
  if (attr && attr.trim()) {
    try {
      initial = JSON.parse(attr);
    } catch (e) {
      console.warn("impetus: invalid scope JSON", e);
      initial = {};
    }
  }

  if (stateManager.isInitialized(root)) return;
  stateManager.markInitialized(root);

  const state = makeReactive(initial, root, true);
  stateManager.setRootState(root, state);
  
  // Ensure components see the global shared store in expressions via with(state)
  try { 
    (state as any).$store = makeReactive(
      (globalThis as any).__impetusStore || ((globalThis as any).__impetusStore = {}), 
      root
    ); 
  } catch {}
  
  try { getDevtoolsHooks()?.onInitRoot?.(root, state); } catch {}
  stateManager.addRoot(root);

  collectBindingsForRoot(root);

  // Initial render
  renderBindings(state, root);

  // Events: onclick/oninput/... (with $event.outside support)
  wireEventHandlers(root, state);
}

export function init(selector: string = "[scope]"): void {
  if (typeof document === "undefined") return;
  
  const nodes = Array.from(document.querySelectorAll(selector));
  nodes.forEach((n) => setupScope(n as Element));

  // New Components API: hosts [use="ClassName"], template resolution by id
  const hosts = Array.from(
    document.querySelectorAll('[use]:not(template):not(script)')
  ) as Element[];
  
  for (const host of hosts) {
    const className = (host.getAttribute('use') || '').trim();
    if (!className) continue;
    const inherit = host.hasAttribute('inherit');
    mountComponent(host, className, inherit);
  }
}

export function destroy(root: Element): void {
  // Remove event listeners
  removeEventListeners(root);
  
  // Clear bindings/state marks
  clearBindings(root);
  stateManager.removeRoot(root);
  
  // Destroy component if applicable
  destroyComponent(root);
  
  try { getDevtoolsHooks()?.onDestroy?.(root); } catch {}
}

// Re-export commonly used functions
export { setDevtoolsHooks, __dev_get_roots, __dev_get_state, __dev_get_bindings } from './devtools';
export { makeReactive } from './state';
export { evalInScope } from './expression';

// Export types for external use
export type { Scope, DevtoolsHooks } from './types';

// Auto-init support: <script type="module" src="./impetus.js" defer init></script>
if (typeof document !== 'undefined') {
  const script = document.querySelector('script[type="module"][init]');
  if (script) {
    queueMicrotask(async () => {
      const { init } = await import('./index');
      init();
    });
  }
}

if (typeof DEVTOOLS !== 'undefined' && DEVTOOLS) {
  import('./devtools').catch(() => {});
}
