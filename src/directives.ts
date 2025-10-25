import type { Scope, DirectiveHandler } from './types';
import { evalInScope } from './expression';
import { parseEachExpression, findElseSibling } from './utils';
import { DIRECTIVES } from './constants';

const ifPlaceholders = new WeakMap<Element, Comment>();
const eachPlaceholders = new WeakMap<Element, Comment>();
const eachTemplates = new WeakMap<Element, Element>();
const eachChildren = new WeakMap<Element, Element[]>();
const eachLastItems = new WeakMap<Element, any[]>();

export const handleIfDirective: DirectiveHandler = (el, expr, state) => {
  const show = Boolean(evalInScope(expr, state));
  let placeholder = ifPlaceholders.get(el);
  
  if (!placeholder) {
    placeholder = document.createComment('if');
    try { el.parentNode?.insertBefore(placeholder, el); } catch {}
    ifPlaceholders.set(el, placeholder);
  }
  
  const parent = placeholder.parentNode;
  if (!parent) return;
  
  // Find else sibling if present
  const elseSibling = findElseSibling(el);
  
  if (show) {
    if (placeholder.nextSibling !== el) {
      try { parent.insertBefore(el, placeholder.nextSibling); } catch {}
      // Ensure events are wired for newly inserted subtree
      try { (window as any).wireEventHandlers?.(el, state); } catch {}
    }
    if (elseSibling?.parentNode) {
      // Hide else sibling if present
      try {
        (elseSibling as HTMLElement).setAttribute('hidden','');
        (elseSibling as HTMLElement).setAttribute('aria-hidden','true');
        (elseSibling as HTMLElement).style.display = 'none';
      } catch {}
    }
  } else {
    if (el.parentNode) {
      try { el.parentNode.removeChild(el); } catch {}
    }
    if (elseSibling && placeholder.nextSibling !== elseSibling) {
      try { parent.insertBefore(elseSibling, placeholder.nextSibling); } catch {}
      // Wire events on else block subtree as it becomes active
      try { (window as any).wireEventHandlers?.(elseSibling, state); } catch {}
    }
    // Show else sibling
    if (elseSibling) {
      try {
        elseSibling.removeAttribute('hidden');
        elseSibling.removeAttribute('aria-hidden');
        (elseSibling as HTMLElement).style.removeProperty('display');
      } catch {}
    }
  }
};

export const handleShowDirective: DirectiveHandler = (el, expr, state) => {
  const visible = Boolean(evalInScope(expr, state));
  const hasTransition = el.hasAttribute('s-transition') || el.hasAttribute('@transition');
  if (hasTransition) {
    const spec = el.getAttribute('s-transition') || el.getAttribute('@transition') || 'fade';
    (window as any).applyTransition?.(el as HTMLElement, spec || 'fade', visible);
    return;
  }
  if (visible) {
    el.removeAttribute('hidden');
    el.removeAttribute('aria-hidden');
    try { (el as HTMLElement).style.removeProperty('display'); } catch {}
  } else {
    el.setAttribute('hidden', '');
    el.setAttribute('aria-hidden', 'true');
    try { (el as HTMLElement).style.display = 'none'; } catch {}
  }
};

export const handleEachDirective: DirectiveHandler = (el, expr, state, root) => {
  if (!root) return;
  
  const { listExpr, itemKey, idxKey } = parseEachExpression(expr);
  let items = evalInScope(listExpr, state) as any[];
  if (!Array.isArray(items)) items = [];
  
  // Skip re-render if items haven't changed
  const lastItems = eachLastItems.get(el);
  if (lastItems && lastItems.length === items.length && 
      lastItems.every((v, i) => v === items[i])) {
    return;
  }
  eachLastItems.set(el, items.slice());
  
  let placeholder = eachPlaceholders.get(el);
  if (!placeholder) {
    placeholder = document.createComment('each');
    try { el.parentNode?.insertBefore(placeholder, el); } catch {}
    eachPlaceholders.set(el, placeholder);
    const template = el.cloneNode(true) as Element;
    eachTemplates.set(el, template);
    try { el.parentNode?.removeChild(el); } catch {}
  }
  
  const parent = placeholder.parentNode;
  if (!parent) return;
  
  // Cleanup previous children
  const previousChildren = eachChildren.get(el) || [];
  for (const child of previousChildren) {
    try { (window as any).destroy?.(child); } catch {}
    try { child.parentNode?.removeChild(child); } catch {}
  }
  
  // Render new children (preserve order with moving anchor)
  const template = eachTemplates.get(el) as Element;
  const newChildren: Element[] = [];
  let anchor: Node = placeholder;
  
  for (let i = 0; i < items.length; i++) {
    let clone: Element | null = null;
    let keyVal: any = undefined;
    const keyExpr = el.getAttribute('key');
    if (keyExpr) {
      keyVal = evalInScope(keyExpr, { ...state, [itemKey]: items[i], [idxKey]: i });
      const prev = (eachChildren.get(el) || []).find(ch => (ch as any)._skey === keyVal);
      if (prev) {
        clone = prev;
        try { parent.insertBefore(clone, anchor.nextSibling); anchor = clone; } catch {}
      }
    }
    if (!clone) {
      clone = template.cloneNode(true) as Element;
      try { parent.insertBefore(clone, anchor.nextSibling); anchor = clone; } catch {}
    }
    if (keyExpr) { try { (clone as any)._skey = keyVal; } catch {} }
    try { 
      clone.removeAttribute('s-each');
      clone.removeAttribute('@each');
    } catch {}
    
    // Create extended state with item and index
    const extendedState: any = Object.create(state);
    try { extendedState.$root = state; } catch {}
    extendedState[itemKey] = items[i];
    extendedState[idxKey] = i;
    
    const reactiveState = (window as any).makeReactive?.(extendedState, clone);
    (window as any).stateManager?.setRootState?.(clone, reactiveState);
    (window as any).collectBindingsForRoot?.(clone);
    (window as any).renderBindings?.(reactiveState, clone);
    (window as any).wireEventHandlers?.(clone, reactiveState);
    newChildren.push(clone);
  }
  
  eachChildren.set(el, newChildren);
};

export const directiveHandlers: Record<string, DirectiveHandler> = {
  's-if': handleIfDirective,
  '@if': handleIfDirective,
  's-show': handleShowDirective,
  '@show': handleShowDirective,
  's-each': handleEachDirective,
  '@each': handleEachDirective,
};
