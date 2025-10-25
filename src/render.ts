import type { Scope } from './types';
import { evalInScope, invalidateComputedCache } from './expression';
import { unwrapExpr } from './utils';
import { DIRECTIVES, PLACEHOLDERS } from './constants';
import { directiveHandlers } from './directives';
import { attrHandlers, handleGenericAttribute } from './attributes';
import { getAttributeBindings, getInterpolationBindings } from './bindings';

export function renderBindings(state: Scope, root: Element): void {
  try { (window as any).devhooks?.onRenderStart?.(root); } catch {}
  
  // Render attribute bindings
  renderAttributeBindings(state, root);
  
  // Render text interpolations
  renderTextInterpolations(state, root);
  
  try { (window as any).devhooks?.onRenderEnd?.(root); } catch {}
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
  // Handle all directives in a unified way
  if (DIRECTIVES.IF.has(attrName) || DIRECTIVES.SHOW.has(attrName) || DIRECTIVES.EACH.has(attrName)) {
    try { (window as any).devhooks?.onDirective?.(el, attrName, { expr }); } catch {}
    directiveHandlers[attrName]?.(el, expr, state, attrName === '@show' ? undefined : root);
    return true;
  }
  
  // @else and @transition are consumed by other handlers
  return DIRECTIVES.ELSE.has(attrName) || DIRECTIVES.TRANSITION.has(attrName);
}

function renderTextInterpolations(state: Scope, root: Element): void {
  const bindings = getInterpolationBindings(root);
  
  for (const binding of bindings) {
    // Handle escaped braces and interpolate
    const rendered = binding.template
      .replace(/\{\{/g, PLACEHOLDERS.LBRACE)
      .replace(/\}\}/g, PLACEHOLDERS.RBRACE)
      .replace(/\{([^}]+)\}/g, (_, expr) => {
        const v = evalInScope(String(expr).trim(), state);
        return v == null ? "" : String(v);
      })
      .replace(new RegExp(PLACEHOLDERS.LBRACE, "g"), "{")
      .replace(new RegExp(PLACEHOLDERS.RBRACE, "g"), "}");
    
    binding.node.textContent = rendered;
  }
}
