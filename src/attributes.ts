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
    if (v == null || v === false) el.removeAttribute('value');
    else el.setAttribute('value', String(v));
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
    if (output) el.setAttribute("class", output);
    else el.removeAttribute("class");
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
    if (st) el.setAttribute("style", st);
    else el.removeAttribute("style");
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
    if (v == null || v === false) el.removeAttribute("value");
    else el.setAttribute("value", String(v));
    return;
  }
  
  // Support mixed template replacement for generic attributes
  if (raw.includes('{') && attrName !== 'class' && attrName !== 'style') {
    const replaced = raw.replace(/\{([^}]+)\}/g, (_, ex) => {
      const val = evalInScope(unwrapExpr(String(ex)), state);
      return val == null ? '' : String(val);
    });
    if (replaced === '') {
      el.removeAttribute(attrName);
    } else {
      el.setAttribute(attrName, replaced);
    }
    return;
  }
  
  if (BOOLEAN_ATTRS.has(attrName)) {
    const boolVal = Boolean(evalInScope(expr, state));
    setBooleanProp(el, attrName, boolVal);
    if (boolVal) el.setAttribute(attrName, "");
    else el.removeAttribute(attrName);
    return;
  }
  
  // Generic attribute binding
  const gv = evalInScope(expr, state);
  if (gv === false || gv == null) {
    el.removeAttribute(attrName);
  } else if (gv === true) {
    el.setAttribute(attrName, "");
  } else {
    el.setAttribute(attrName, String(gv));
  }
}
