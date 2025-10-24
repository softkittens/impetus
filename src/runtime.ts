type Scope = Record<string, any>;

type AttrBinding = { el: Element; attr: string; expr: string };
type InterpBinding = { node: Text; template: string };

const attrBindings = new WeakMap<Element, AttrBinding[]>();
const interpBindings = new WeakMap<Element, InterpBinding[]>();
const exprCache = new Map<string, Function>();
const rootStateMap = new WeakMap<Element, Scope>();
const scheduled = new WeakSet<Element>();
const initialized = new WeakSet<Element>();
const reactiveCache = new WeakMap<object, any>();
const listenerMap = new WeakMap<Element, { el: EventTarget; event: string; handler: EventListener }[]>();
const componentInstance = new WeakMap<Element, any>();
const ctorCache = new Map<string, any>();

// ----------------------------------------
// Expression compilation & evaluation
// ----------------------------------------

function compile(expr: string): Function {
  let fn = exprCache.get(expr);
  if (!fn) {
    // Note: "with" is not allowed in strict mode. We intentionally avoid "use strict" here.
    // Provide $event as a parameter for event expressions.
    // eslint-disable-next-line no-new-func
    fn = new Function("state", "$event", `with(state){ return ( ${expr} ) }`);
    exprCache.set(expr, fn);
  }
  return fn;
}

function unwrapExpr(raw: string): string {
  let s = (raw || "").trim();
  // Remove one or two layers of surrounding braces if present
  const stripOnce = (t: string) => (t.startsWith("{") && t.endsWith("}")) ? t.slice(1, -1).trim() : t;
  s = stripOnce(s);
  s = stripOnce(s);
  return s;
}

function evalInScope(expr: string, state: Scope, $event?: Event) {
  try {
    const fn = compile(expr);
    return fn(state, $event);
  } catch (e) {
    console.warn("sparkle: eval error", expr, e);
    return undefined;
  }
}

// ----------------------------------------
// DOM utilities & normalization
// ----------------------------------------

function setBooleanProp(el: Element, prop: string, v: any) {
  try {
    (el as any)[prop] = Boolean(v);
  } catch {}
}

function setValueProp(el: Element, v: any) {
  try {
    (el as any).value = v == null ? "" : String(v);
  } catch {}
}

function normalizeClass(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.filter(Boolean).map(String).join(" ");
  if (typeof v === "object") return Object.keys(v).filter((k) => v[k]).join(" ");
  return String(v);
}

function toKebab(s: string) {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

function normalizeStyle(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    return Object.entries(v)
      .filter(([, val]) => val != null && val !== false)
      .map(([k, val]) => `${toKebab(k)}:${String(val)}`)
      .join(";");
  }
  return String(v);
}

const BOOLEAN_ATTRS = new Set([
  "checked","disabled","readonly","required","open","selected","hidden",
  "autofocus","multiple","muted","playsinline","controls"
]);

function hasBraces(v: string | null): boolean {
  return !!(v && v.includes("{"));
}

function shouldBindAttr(name: string, value: string | null): boolean {
  if (name === "value" || name === "disabled" || name === "checked") return true;
  if (name === "class" || name === "style") return hasBraces(value);
  return hasBraces(value);
}

// ----------------------------------------
// Render pass: apply attribute bindings and text interpolations
// ----------------------------------------

function scheduleRender(root: Element) {
  if (scheduled.has(root)) return;
  scheduled.add(root);
  queueMicrotask(() => {
    scheduled.delete(root);
    const state = rootStateMap.get(root);
    if (state) renderBindings(state, root);
  });
}

function renderBindings(state: Scope, root: Element) {
  const alist = attrBindings.get(root) || [];
  for (const b of alist) {
    const raw = b.expr || "";
    const expr = unwrapExpr(raw);
    const attrName = b.attr;
    // Special cases
    if (attrName === "class") {
      let output = "";
      if (raw.includes("{")) {
        output = raw.replace(/\{([^}]+)\}/g, (_, ex) => {
          const val = evalInScope(unwrapExpr(String(ex)), state);
          return normalizeClass(val);
        });
      } else {
        // No dynamic parts: leave as-is (but normalize if it's an expression-only binding)
        output = raw;
      }
      output = output.trim().replace(/\s+/g, " ");
      if (output) b.el.setAttribute("class", output);
      else b.el.removeAttribute("class");
      continue;
    }
    if (attrName === "style") {
      let st = "";
      if (raw.includes("{")) {
        // Replace each {expr} with normalized style string of its value (object or string)
        st = raw.replace(/\{([^}]+)\}/g, (_, ex) => {
          const val = evalInScope(unwrapExpr(String(ex)), state);
          return normalizeStyle(val);
        });
      } else {
        st = raw;
      }
      st = st.trim().replace(/;+\s*$/g, "");
      if (st) b.el.setAttribute("style", st);
      else b.el.removeAttribute("style");
      continue;
    }
    const v = evalInScope(expr, state);
    if (attrName === "value") {
      setValueProp(b.el, v);
      if (v == null || v === false) b.el.removeAttribute("value");
      else b.el.setAttribute("value", String(v));
      continue;
    }
    if (BOOLEAN_ATTRS.has(attrName)) {
      const boolVal = Boolean(v);
      setBooleanProp(b.el, attrName, boolVal);
      if (boolVal) b.el.setAttribute(attrName, "");
      else b.el.removeAttribute(attrName);
      continue;
    }
    // Generic attribute binding
    if (v === false || v == null) {
      b.el.removeAttribute(attrName);
    } else if (v === true) {
      b.el.setAttribute(attrName, "");
    } else {
      b.el.setAttribute(attrName, String(v));
    }
  }

  const ilist = interpBindings.get(root) || [];
  for (const b of ilist) {
    // Support escaping with double braces {{ and }} to output literal braces
    const placeholderL = "\u0000LBRACE\u0000";
    const placeholderR = "\u0000RBRACE\u0000";
    const tpl = b.template.replace(/\{\{/g, placeholderL).replace(/\}\}/g, placeholderR);
    const rendered = tpl.replace(/\{([^}]+)\}/g, (_, expr) => {
      const v = evalInScope(String(expr).trim(), state);
      return v == null ? "" : String(v);
    })
    .replace(new RegExp(placeholderL, "g"), "{")
    .replace(new RegExp(placeholderR, "g"), "}");
    b.node.textContent = rendered;
  }
}

// ----------------------------------------
// Reactive state
// ----------------------------------------

function makeReactive<T extends object>(obj: T, root: Element): T {
  if (obj === null || typeof obj !== "object") return obj;
  const existing = reactiveCache.get(obj as unknown as object);
  if (existing) return existing;
  const proxy = new Proxy(obj as unknown as object, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (val && typeof val === "object") {
        return makeReactive(val as any, root);
      }
      return val;
    },
    set(target, prop, value, receiver) {
      const res = Reflect.set(target, prop, value, receiver);
      scheduleRender(root);
      return res;
    },
    deleteProperty(target, prop) {
      const res = Reflect.deleteProperty(target, prop);
      scheduleRender(root);
      return res;
    },
  });
  reactiveCache.set(obj as unknown as object, proxy);
  return proxy as T;
}

// ----------------------------------------
// Binding discovery & event wiring
// ----------------------------------------

function collectBindingsForRoot(root: Element) {
  // Attribute bindings
  const abinds: AttrBinding[] = [];
  const all = root.querySelectorAll("*");
  all.forEach((el) => {
    for (const { name, value } of Array.from(el.attributes)) {
      if (shouldBindAttr(name, value)) {
        abinds.push({ el, attr: name, expr: value || "" });
      }
    }
  });
  attrBindings.set(root, abinds);

  // Text interpolations
  const ibinds: InterpBinding[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const t = node as Text;
    const parent = t.parentElement;
    if (parent && ["SCRIPT", "STYLE", "TEMPLATE"].includes(parent.tagName)) {
      // skip
    } else if (t.nodeValue && /\{[^}]+\}/.test(t.nodeValue)) {
      ibinds.push({ node: t, template: t.nodeValue });
    }
    node = walker.nextNode();
  }
  interpBindings.set(root, ibinds);
}

function wireEventHandlers(root: Element, state: Scope) {
  const listeners: { el: Element; event: string; handler: EventListener }[] = [];
  const all = root.querySelectorAll("*");
  all.forEach((el) => {
    for (const { name, value } of Array.from(el.attributes)) {
      if (name.startsWith("on") && name.length > 2) {
        const event = name.slice(2);
        const needsOutside = (value || '').includes('$event.outside');
        const target: EventTarget = needsOutside ? document : el;
        const handler = (ev: Event) => {
          const wrapped = new Proxy(ev as any, {
            get(t, p) {
              if (p === 'outside') {
                return !(root.contains(ev.target as Node));
              }
              // @ts-ignore
              return t[p];
            }
          });
          evalInScope(value, state, wrapped as any);
          scheduleRender(root);
        };
        target.addEventListener(event, handler as EventListener, needsOutside ? true : false);
        listeners.push({ el: target as any, event, handler: handler as EventListener });
        try { el.removeAttribute(name); } catch {}
      }
    }
  });
  if (listeners.length) listenerMap.set(root, listeners);
}

// ----------------------------------------
// Scope mounting ([scope])
// ----------------------------------------

function setupScope(root: Element) {
  // Parse scope JSON if provided, else empty object
  const attr = root.getAttribute("scope");
  let initial: Scope = {};
  if (attr && attr.trim()) {
    try {
      initial = JSON.parse(attr);
    } catch (e) {
      console.warn("sparkle: invalid scope JSON", e);
      initial = {};
    }
  }

  if (initialized.has(root)) return;
  initialized.add(root);

  const state = makeReactive(initial, root);
  rootStateMap.set(root, state);

  collectBindingsForRoot(root);

  // Initial render
  renderBindings(state, root);

  // Events: onclick/oninput/... (with $event.outside support)
  wireEventHandlers(root, state);
}

export function init(selector: string = "[scope]") {
  if (typeof document === "undefined") return;
  const nodes = Array.from(document.querySelectorAll(selector));
  nodes.forEach((n) => setupScope(n as Element));

  // New Components API: hosts [use="ClassName"], template resolution by id
  function toCamel(s: string) {
    return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }
  function coerce(v: string): any {
    if (v === "true") return true;
    if (v === "false") return false;
    if (v === "null") return null;
    if (v === "undefined") return undefined;
    if (!isNaN(Number(v)) && v.trim() !== "") return Number(v);
    return v;
  }
  function parseProps(host: Element) {
    let props: Record<string, any> = {};
    const raw = host.getAttribute("props");
    if (raw) {
      try { props = JSON.parse(raw); } catch { console.warn("sparkle: invalid props JSON", raw); }
    }
    for (const { name, value } of Array.from(host.attributes)) {
      if (name === "use" || name === "template" || name === "props") continue;
      // data-* and aria-* included as-is; others camelCased
      const key = name.startsWith("data-") || name.startsWith("aria-") ? name : toCamel(name);
      props[key] = coerce(value);
    }
    return props;
  }

  const hosts = Array.from(
    document.querySelectorAll('[use]:not(template):not(script)')
  ) as Element[];
  for (const host of hosts) {
    const className = (host.getAttribute('use') || '').trim();
    if (!className) continue;
    function resolveCtor(name: string) {
      const g = (globalThis as any)[name];
      if (typeof g === 'function') return g;
      if (ctorCache.has(name)) return ctorCache.get(name);
      // Evaluate all non-module scripts to retrieve the class by name
      try {
        const scripts = Array.from(document.querySelectorAll('script')) as HTMLScriptElement[];
        const code = scripts
          .filter(s => !s.type || s.type === 'text/javascript')
          .map(s => s.textContent || '')
          .join('\n');
        const found = new Function(
          'return (function(){\n' +
          code +
          `\n;try { return typeof ${name}==='function' ? ${name} : null } catch(_) { return null }\n})()`
        )();
        if (typeof found === 'function') {
          ctorCache.set(name, found);
          return found;
        }
      } catch (e) {
        console.warn('sparkle: ctor eval error for', name, e);
      }
      return undefined;
    }
    const ctor = resolveCtor(className);
    if (typeof ctor !== 'function') {
      console.warn('sparkle: constructor not found on global scope for', className);
      continue;
    }
    const props = parseProps(host);
    let instance: any;
    try { instance = new ctor(props); } catch (e) {
      console.warn('sparkle: error constructing', className, e);
      instance = {};
    }

    // Resolve template id: host attr -> static -> instance
    const hostTpl = host.getAttribute('template');
    const staticTpl = (ctor as any).template;
    const instTpl = instance?.template;
    const tplId = hostTpl || staticTpl || instTpl;
    if (tplId) {
      const tplEl = document.getElementById(String(tplId)) as HTMLTemplateElement | null;
      if (tplEl && tplEl.tagName === 'TEMPLATE') {
        host.innerHTML = '';
        host.appendChild(tplEl.content.cloneNode(true));
      } else {
        console.warn('sparkle: template id not found', tplId);
      }
    }

    if (initialized.has(host)) continue;
    initialized.add(host);
    // Expose host to instance
    try { (instance as any).$el = host; } catch {}
    const reactive = makeReactive(instance, host);
    rootStateMap.set(host, reactive);
    componentInstance.set(host, instance);

    // Collect bindings & interpolations inside host
    collectBindingsForRoot(host);

    renderBindings(reactive, host);
    // Events
    wireEventHandlers(host, reactive);
    try { instance?.onMount?.(host) } catch {}
  }
}

export function destroy(root: Element) {
  // Remove event listeners
  const listeners = listenerMap.get(root) || [];
  for (const { el, event, handler } of listeners) {
    el.removeEventListener(event, handler);
  }
  listenerMap.delete(root);
  // Clear bindings/state marks
  attrBindings.delete(root);
  interpBindings.delete(root);
  rootStateMap.delete(root);
  scheduled.delete(root);
  initialized.delete(root);
  try { (componentInstance.get(root) as any)?.onDestroy?.() } catch {}
}
