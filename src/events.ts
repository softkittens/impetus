import type { Scope, EventHandler } from './types';
import { evalInScope, assignInScope } from './expression';

const listenerMap = new WeakMap<Element, EventHandler[]>();

export function wireEventHandlers(root: Element, state: Scope): void {
  const listeners: EventHandler[] = [];
  const all = [root, ...Array.from(root.querySelectorAll("*"))] as Element[];
  
  all.forEach((el) => {
    // Skip if element has its own state that differs from what we're wiring
    const mapped = (window as any).stateManager?.getRootState?.(el);
    if (mapped && mapped !== state && el !== root) {
      return; // child element managed by different scope
    }
    
    // Skip elements with @each - they're templates that will be cloned
    if (el.hasAttribute('s-each') || el.hasAttribute('@each')) {
      return;
    }
    
    // Auto-wire two-way model if present
    if (el.hasAttribute('data-model')) {
      wireModelBinding(el, state, root, listeners);
    }
    
    // Wire event handlers
    wireEventListeners(el, state, root, listeners);
  });
  
  if (listeners.length) listenerMap.set(root, listeners);
  try { (window as any).devhooks?.onWireEvents?.(root, listeners.length); } catch {}
}

function wireModelBinding(el: Element, state: Scope, root: Element, listeners: EventHandler[]): void {
  const path = el.getAttribute('data-model') || '';
  const tag = el.tagName;
  let evt = 'input';
  if (tag === 'SELECT') evt = 'change';
  if (tag === 'INPUT') {
    const typ = (el as HTMLInputElement).type;
    if (typ === 'checkbox' || typ === 'radio') evt = 'change';
  }
  
  const handler = (ev: Event) => {
    const t = ev.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    let newValue: any;
    
    if (t instanceof HTMLInputElement && t.type === 'checkbox') {
      newValue = t.checked;
    } else if (t instanceof HTMLInputElement && (t.type === 'number' || t.type === 'range')) {
      newValue = t.value === '' ? '' : Number(t.value);
    } else {
      newValue = (t as any).value;
    }
    
    assignInScope(path, state, newValue);
    (window as any).stateManager?.scheduleRender?.(root);
  };
  
  el.addEventListener(evt, handler as EventListener);
  listeners.push({ el: el as any, event: evt, handler: handler as EventListener });
}

function wireEventListeners(el: Element, state: Scope, root: Element, listeners: EventHandler[]): void {
  for (const { name, value } of Array.from(el.attributes)) {
    if (name.startsWith("on") && name.length > 2) {
      const parts = name.slice(2).split('.');
      const event = parts[0] as string;
      const mods = new Set(parts.slice(1)); // prevent, stop, once
      const needsOutside = (value || '').includes('$event.outside');
      const isGlobalKey = event === 'keydown';
      const target: EventTarget = (needsOutside || isGlobalKey) ? document : el;
      
      const handler = (ev: Event) => {
        if (mods.has('prevent')) { try { ev.preventDefault(); } catch {} }
        if (mods.has('stop')) { try { ev.stopPropagation(); } catch {} }
        
        const wrapped = new Proxy(ev as any, {
          get(t, p) {
            if (p === 'outside') {
              // Outside relative to the element that declared the handler
              return !(el.contains(ev.target as Node));
            }
            // @ts-ignore
            const v = (t as any)[p];
            return typeof v === 'function' ? v.bind(t) : v;
          }
        });
        
        evalInScope(value, state, wrapped as any);
        (window as any).stateManager?.scheduleRender?.(root);
      };
      
      // Use capture only for outside click to ensure it fires before element handlers
      const useCapture = needsOutside ? true : false;
      let opts: boolean | AddEventListenerOptions | undefined;
      if (mods.has('once') && useCapture) opts = { capture: true, once: true };
      else if (mods.has('once')) opts = { once: true };
      else if (useCapture) opts = true; // boolean capture shorthand
      
      target.addEventListener(event, handler as EventListener, opts);
      listeners.push({ el: target as any, event, handler: handler as EventListener });
      
      // remove inline to avoid global-scope eval
      try { el.removeAttribute(name); } catch {}
    }
  }
}

export function removeEventListeners(root: Element): void {
  const listeners = listenerMap.get(root) || [];
  for (const { el, event, handler } of listeners) {
    el.removeEventListener(event, handler);
  }
  listenerMap.delete(root);
}
