import { DIRECTIVES } from './constants';

export function toCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
          .replace(/-+/g, '') // Remove multiple consecutive dashes
          .replace(/-$/, ''); // Remove trailing dash
}

export function toKebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2") // Handle consecutive uppercase letters
    .replace(/_/g, "-")
    .toLowerCase();
}

export function coerce(value: string): any {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (value === "undefined") return undefined;
  if (!isNaN(Number(value)) && value.trim() !== "") return Number(value);
  return value;
}

export function normalizeClass(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.flat(Infinity) // Flatten nested arrays
                   .filter(Boolean) 
                   .map(String) 
                   .join(" ");
  }
  if (typeof value === "object") return Object.keys(value).filter((k) => value[k]).join(" ");
  return String(value);
}

export function normalizeStyle(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([, val]) => val != null && val !== false)
      .map(([k, val]) => `${toKebab(k)}:${String(val)}`)
      .join(";");
  }
  return String(value);
}

export function unwrapExpr(raw: string): string {
  let s = (raw || "").trim();
  const stripOnce = (t: string) => (t.startsWith("{") && t.endsWith("}")) ? t.slice(1, -1).trim() : t;
  // Only strip braces twice if the result still has braces
  s = stripOnce(s);
  if (s.startsWith("{") && s.endsWith("}")) {
    s = stripOnce(s);
  }
  return s;
}

export function hasBraces(value: string | null): boolean {
  return !!(value && value.includes("{"));
}

export function isDirective(name: string): boolean {
  return Object.values(DIRECTIVES).some(set => set.has(name));
}

export function shouldBindAttr(name: string, value: string | null): boolean {
  if (isDirective(name)) return true;
  if (name === "value" || name === "disabled" || name === "checked") return true;
  if (name === "class" || name === "style") return hasBraces(value);
  return hasBraces(value);
}

export function isPlainObject(value: any): boolean {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function parseProps(host: Element): Record<string, any> {
  let props: Record<string, any> = {};
  const raw = host.getAttribute("props");
  if (raw) {
    try { props = JSON.parse(raw); } catch { console.warn("impetus: invalid props JSON", raw); }
  }
  for (const { name, value } of Array.from(host.attributes)) {
    if (name === "use" || name === "template" || name === "props") continue;
    const key = name.startsWith("data-") || name.startsWith("aria-") ? name : toCamel(name);
    props[key] = coerce(value);
  }
  return props;
}

export function parseEachExpression(expr: string): { listExpr: string; itemKey: string; idxKey: string } {
  const match = expr.match(/^(.*?)(?:\s+as\s+([a-zA-Z_$][\w$]*)(?:\s*,\s*([a-zA-Z_$][\w$]*))?)?$/);
  return {
    listExpr: (match?.[1] || expr).trim(),
    itemKey: (match?.[2] || 'item').trim(),
    idxKey: (match?.[3] || 'i').trim()
  };
}

export function setBooleanProp(el: Element, prop: string, value: any): void {
  try {
    (el as any)[prop] = Boolean(value);
  } catch {}
}

export function setValueProp(el: Element, value: any): void {
  try {
    (el as any).value = value == null ? "" : String(value);
  } catch {}
}

export function isInsideEachTemplate(element: Element | null): boolean {
  let current = element?.parentElement || null;
  while (current) {
    if (current.hasAttribute?.('s-each') || current.hasAttribute?.('@each')) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

export function findElseSibling(el: Element): Element | null {
  const sibling = el.nextElementSibling;
  if (!sibling) return null;
  if (sibling.hasAttribute('s-else') || sibling.hasAttribute('@else')) return sibling;
  return null;
}
