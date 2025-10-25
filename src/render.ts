import type { Scope } from './types';
import { evalInScope, invalidateComputedCache } from './expression';
import { unwrapExpr } from './utils';
import { DIRECTIVES, PLACEHOLDERS } from './constants';
import { directiveHandlers } from './directives';
import { attrHandlers, handleGenericAttribute } from './attributes';
import { getAttributeBindings, getInterpolationBindings } from './bindings';

export function renderBindings(state: Scope, root: Element): void {
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
  try { (window as any).devhooks?.onRenderStart?.(root); } catch {}
  
  // Render attribute bindings
  renderAttributeBindings(state, root);
  
  const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
  try { (window as any).devhooks?.onRenderEnd?.(root, { duration: t1 && t0 ? (t1 - t0) : 0 }); } catch {}
  
  // Render text interpolations
  renderTextInterpolations(state, root);
}

function renderAttributeBindings(state: Scope, root: Element): void {
  const bindings = getAttributeBindings(root);
  
  for (const binding of bindings) {
    const raw = binding.expr || "";
    const expr = unwrapExpr(raw);
    const attrName = binding.attr;
    
    // Handle directives
    if (handleDirective(binding.el, attrName, expr, state, root)) {
      continue;
    }
    
    // Skip if element is disconnected
    try { if (!(binding.el as any).isConnected) continue; } catch {}
    
    // Use consolidated handlers for special attributes
    const handler = attrHandlers[attrName];
    if (handler && handler(binding.el, expr, raw, state, root)) {
      continue;
    }
    
    // Handle generic attributes
    handleGenericAttribute(binding.el, attrName, expr, raw, state);
  }
}

function handleDirective(el: Element, attrName: string, expr: string, state: Scope, root: Element): boolean {
  // @if directive
  if (DIRECTIVES.IF.has(attrName)) {
    try { (window as any).devhooks?.onDirective?.(el, '@if', { expr }); } catch {}
    directiveHandlers[attrName]?.(el, expr, state, root);
    return true;
  }
  
  // @show directive
  if (DIRECTIVES.SHOW.has(attrName)) {
    try { (window as any).devhooks?.onDirective?.(el, '@show', { expr }); } catch {}
    directiveHandlers[attrName]?.(el, expr, state);
    return true;
  }
  
  // @else directive (handled by @if)
  if (DIRECTIVES.ELSE.has(attrName)) {
    return true;
  }
  
  // @each directive
  if (DIRECTIVES.EACH.has(attrName)) {
    try { (window as any).devhooks?.onDirective?.(el, '@each', { expr }); } catch {}
    directiveHandlers[attrName]?.(el, expr, state, root);
    return true;
  }
  
  // @transition directive (consumed by @show/@if handlers)
  if (DIRECTIVES.TRANSITION.has(attrName)) {
    return true;
  }
  
  return false;
}

function renderTextInterpolations(state: Scope, root: Element): void {
  const bindings = getInterpolationBindings(root);
  
  for (const binding of bindings) {
    // Support escaping with double braces {{ and }} to output literal braces
    const tpl = binding.template
      .replace(/\{\{/g, PLACEHOLDERS.LBRACE)
      .replace(/\}\}/g, PLACEHOLDERS.RBRACE);
    
    const rendered = tpl.replace(/\{([^}]+)\}/g, (_, expr) => {
      const v = evalInScope(String(expr).trim(), state);
      return v == null ? "" : String(v);
    })
    .replace(new RegExp(PLACEHOLDERS.LBRACE, "g"), "{")
    .replace(new RegExp(PLACEHOLDERS.RBRACE, "g"), "}");
    
    binding.node.textContent = rendered;
  }
}
