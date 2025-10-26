/**
 * IMPETUS FRAMEWORK - Attribute Binding Helpers
 * 
 * Provides specialized handlers for common attributes and a generic fallback.
 * These helpers evaluate inline expressions and write the correct DOM properties
 * and attributes so the UI stays in sync with state.
 * 
 * WHY THIS MODULE EXISTS:
 * - Some attributes need special handling (e.g., value, checked) beyond setAttribute
 * - Normalizes complex inputs (class/style objects, arrays) to strings
 * - Centralizes boolean and value semantics so other modules can stay simple
 */
import type { Scope, AttributeHandler } from './types';
import { evalInScope } from './expression';
import { unwrapExpr, normalizeClass, normalizeStyle, setBooleanProp, setValueProp } from './utils';
import { BOOLEAN_ATTRS } from './constants';

export const attrHandlers: Record<string, AttributeHandler> = {
  // Two-way model binding
  value(el, expr, raw, state) {
    if (!el.hasAttribute('data-model')) return false;
    const tag = el.tagName;
    if (tag === 'INPUT') {
      const typ = (el as HTMLInputElement).type;
      if (typ === 'checkbox') {
        const bv = Boolean(evalInScope(expr, state));
        setBooleanProp(el, 'checked', bv);
        if (bv) el.setAttribute('checked', ''); else el.removeAttribute('checked');
        return true;
      }
      if (typ === 'radio') {
        const modelVal = evalInScope(expr, state);
        const elVal = (el as HTMLInputElement).value;
        const isChecked = String(modelVal) === String(elVal);
        setBooleanProp(el, 'checked', isChecked);
        if (isChecked) el.setAttribute('checked', ''); else el.removeAttribute('checked');
        return true;
      }
    }
    const v = evalInScope(expr, state);
    setValueProp(el, v);
    if (v == null || v === false) {
      if (el.hasAttribute('value')) el.removeAttribute('value');
    } else {
      const nv = String(v);
      if (el.getAttribute('value') !== nv) el.setAttribute('value', nv);
    }
    return true;
  },
  
  // Class binding with normalization
  class(el, expr, raw, state) {
    let output = "";
    if (raw.includes("{")) {
      output = raw.replace(/\{([^}]+)\}/g, (_, ex) => {
        const val = evalInScope(unwrapExpr(String(ex)), state);
        return normalizeClass(val);
      });
    } else {
      output = raw;
    }
    output = output.trim().replace(/\s+/g, " ");
    if (output) {
      if (el.getAttribute("class") !== output) el.setAttribute("class", output);
    } else {
      if (el.hasAttribute("class")) el.removeAttribute("class");
    }
    return true;
  },
  
  // Style binding with normalization
  style(el, expr, raw, state) {
    let st = "";
    if (raw.includes("{")) {
      st = raw.replace(/\{([^}]+)\}/g, (_, ex) => {
        const val = evalInScope(unwrapExpr(String(ex)), state);
        return normalizeStyle(val);
      });
    } else {
      st = raw;
    }
    st = st.trim().replace(/;+\s*$/g, "");
    if (st) {
      if (el.getAttribute("style") !== st) el.setAttribute("style", st);
    } else {
      if (el.hasAttribute("style")) el.removeAttribute("style");
    }
    return true;
  },
};

export function handleGenericAttribute(
  el: Element, 
  attrName: string, 
  expr: string, 
  raw: string, 
  state: Scope
): void {
  // Handle value property binding explicitly
  if (attrName === "value") {
    const v = evalInScope(expr, state);
    setValueProp(el, v);
    if (v == null || v === false) {
      if (el.hasAttribute("value")) el.removeAttribute("value");
    } else {
      const nv = String(v);
      if (el.getAttribute("value") !== nv) el.setAttribute("value", nv);
    }
    return;
  }
  
  // Handle boolean attributes with proper semantics before template processing
  if (BOOLEAN_ATTRS.has(attrName)) {
    const boolVal = Boolean(evalInScope(expr, state));
    setBooleanProp(el, attrName, boolVal);
    if (boolVal) {
      if (!el.hasAttribute(attrName)) el.setAttribute(attrName, "");
    } else {
      if (el.hasAttribute(attrName)) el.removeAttribute(attrName);
    }
    return;
  }

  // Support mixed template replacement for generic attributes
  if (raw.includes('{') && attrName !== 'class' && attrName !== 'style') {
    const trimmed = (raw || '').trim();
    const isSingleExpr = /^\{[^}]+\}$/.test(trimmed) || /^\{\{[^}]+\}\}$/.test(trimmed);
    if (isSingleExpr) {
      const gv = evalInScope(unwrapExpr(trimmed), state);
      if (gv === false || gv == null || gv === '') {
        if (el.hasAttribute(attrName)) el.removeAttribute(attrName);
      } else if (gv === true) {
        if (!el.hasAttribute(attrName)) el.setAttribute(attrName, "");
      } else {
        const nv = String(gv);
        if (el.getAttribute(attrName) !== nv) el.setAttribute(attrName, nv);
      }
      return;
    }
    const replaced = raw.replace(/\{([^}]+)\}/g, (_, ex) => {
      const val = evalInScope(unwrapExpr(String(ex)), state);
      return val == null ? '' : String(val);
    });
    if (replaced === '') {
      if (el.hasAttribute(attrName)) el.removeAttribute(attrName);
    } else {
      if (el.getAttribute(attrName) !== replaced) el.setAttribute(attrName, replaced);
    }
    return;
  }
  
  // Generic attribute binding
  const gv = evalInScope(expr, state);
  if (gv === false || gv == null) {
    if (el.hasAttribute(attrName)) el.removeAttribute(attrName);
  } else if (gv === true) {
    if (!el.hasAttribute(attrName)) el.setAttribute(attrName, "");
  } else {
    const nv = String(gv);
    if (el.getAttribute(attrName) !== nv) el.setAttribute(attrName, nv);
  }
}
