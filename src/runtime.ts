type Scope = Record<string, any>;

type AttrBinding = { el: Element; attr: string; expr: string };
type InterpBinding = { node: Text; template: string };

const attrBindings = new WeakMap<Element, AttrBinding[]>();
const interpBindings = new WeakMap<Element, InterpBinding[]>();
const exprCache = new Map<string, Function>();
const assignCache = new Map<string, Function>();
const rootStateMap = new WeakMap<Element, Scope>();
const scheduled = new WeakSet<Element>();
const initialized = new WeakSet<Element>();
const reactiveCache = new WeakMap<object, any>();
const reactiveProxies = new WeakSet<object>();
const proxyRoots = new WeakMap<object, Set<Element>>();
const listenerMap = new WeakMap<Element, { el: EventTarget; event: string; handler: EventListener }[]>();
const ifPlaceholders = new WeakMap<Element, Comment>();
const eachPlaceholders = new WeakMap<Element, Comment>();
const eachTemplates = new WeakMap<Element, Element>();
const eachChildren = new WeakMap<Element, Element[]>();
const eachLastItems = new WeakMap<Element, any[]>();
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

function assignInScope(path: string, state: Scope, value: any) {
  try {
    let fn = assignCache.get(path);
    if (!fn) {
      // eslint-disable-next-line no-new-func
      fn = new Function('state', '__v', `with(state){ return (${path} = __v) }`);
      assignCache.set(path, fn);
    }
    return fn(state, value);
  } catch (e) {
    console.warn('sparkle: assign error', path, e);
    return undefined;
  }
}

function resolveCtor(name: string): any {
  const g = (globalThis as any)[name];
  if (typeof g === 'function') return g;
  if (ctorCache.has(name)) return ctorCache.get(name);
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
  } catch {}
  return undefined;
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
  if (name === "s-if" || name === "s-show" || name === "@if" || name === "@show" || name === 's-else' || name === '@else' || name === 's-each' || name === '@each') return true;
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
    // s-model (two-way) is represented as data-model marker and an attr 'value'
    if (attrName === 'value' && (b.el as Element).hasAttribute('data-model')) {
      const tag = b.el.tagName;
      if (tag === 'INPUT') {
        const typ = (b.el as HTMLInputElement).type;
        if (typ === 'checkbox') {
          const bv = Boolean(evalInScope(expr, state));
          setBooleanProp(b.el, 'checked', bv);
          if (bv) (b.el as Element).setAttribute('checked', ''); else (b.el as Element).removeAttribute('checked');
          continue;
        }
        if (typ === 'radio') {
          const modelVal = evalInScope(expr, state);
          const elVal = (b.el as HTMLInputElement).value;
          const isChecked = String(modelVal) === String(elVal);
          setBooleanProp(b.el, 'checked', isChecked);
          if (isChecked) (b.el as Element).setAttribute('checked', ''); else (b.el as Element).removeAttribute('checked');
          continue;
        }
      }
      // default path: set value prop/attr
      const v = evalInScope(expr, state);
      setValueProp(b.el, v);
      if (v == null || v === false) (b.el as Element).removeAttribute('value');
      else (b.el as Element).setAttribute('value', String(v));
      continue;
    }
    // Conditionals
    if (attrName === 's-if' || attrName === '@if') {
      const show = Boolean(evalInScope(expr, state));
      let ph = ifPlaceholders.get(b.el);
      if (!ph) {
        ph = document.createComment('s-if');
        try { b.el.parentNode?.insertBefore(ph, b.el); } catch {}
        ifPlaceholders.set(b.el, ph);
      }
      const parent = ph.parentNode as Node | null;
      if (!parent) continue;
      // find potential else sibling
      let elseEl: Element | null = null;
      let sib: Element | null = (b.el as Element).nextElementSibling;
      while (sib) {
        if (sib.hasAttribute('s-else') || sib.hasAttribute('@else')) { elseEl = sib; break; }
        if (!sib.hasAttribute('s-if') && !sib.hasAttribute('@if') && !sib.hasAttribute('s-show') && !sib.hasAttribute('@show')) {
          // stop scanning at unrelated element (keep only immediate logical pair)
          break;
        }
        break;
      }
      if (show) {
        if (ph.nextSibling !== b.el) {
          try { parent.insertBefore(b.el, ph.nextSibling); } catch {}
        }
        if (elseEl && elseEl.parentNode) {
          try { elseEl.parentNode.removeChild(elseEl); } catch {}
        }
      } else {
        if (b.el.parentNode) {
          try { b.el.parentNode.removeChild(b.el); } catch {}
        }
        if (elseEl) {
          if (ph.nextSibling !== elseEl) {
            try { parent.insertBefore(elseEl, ph.nextSibling); } catch {}
          }
        }
      }
      continue;
    }
    if (attrName === 's-show' || attrName === '@show') {
      const vis = Boolean(evalInScope(expr, state));
      if (vis) {
        b.el.removeAttribute('hidden');
        b.el.removeAttribute('aria-hidden');
      } else {
        b.el.setAttribute('hidden', '');
        b.el.setAttribute('aria-hidden', 'true');
      }
      continue;
    }
    if (attrName === 's-else' || attrName === '@else') {
      // handled by preceding s-if/@if block
      continue;
    }
    if (attrName === 's-each' || attrName === '@each') {
      // Parse pattern: "itemsExpr" or "itemsExpr as item,i"
      const m = expr.match(/^(.*?)(?:\s+as\s+([a-zA-Z_$][\w$]*)(?:\s*,\s*([a-zA-Z_$][\w$]*))?)?$/);
      const listExpr = (m?.[1] || expr).trim();
      const itemKey = (m?.[2] || 'item').trim();
      const idxKey = (m?.[3] || 'i').trim();
      let items = evalInScope(listExpr, state) as any[];
      if (!Array.isArray(items)) items = [];
      // Skip re-render if items haven't changed (shallow check)
      const last = eachLastItems.get(b.el);
      if (last && last.length === items.length && last.every((v, i) => v === items[i])) {
        continue;
      }
      eachLastItems.set(b.el, items.slice());
      let ph = eachPlaceholders.get(b.el);
      if (!ph) {
        ph = document.createComment('s-each');
        try { b.el.parentNode?.insertBefore(ph, b.el); } catch {}
        eachPlaceholders.set(b.el, ph);
        // store template (original element) and remove it from DOM
        const tpl = b.el as Element;
        eachTemplates.set(b.el, tpl.cloneNode(true) as Element);
        try { tpl.parentNode?.removeChild(tpl); } catch {}
      }
      const parent = ph.parentNode as Node | null;
      if (!parent) continue;
      // cleanup previous children
      const prev = eachChildren.get(b.el) || [];
      for (const n of prev) {
        try { destroy(n); } catch {}
        try { n.parentNode?.removeChild(n); } catch {}
      }
      const created: Element[] = [];
      const tpl = eachTemplates.get(b.el) as Element;
      for (let i = 0; i < items.length; i++) {
        const child = tpl.cloneNode(true) as Element;
        try { child.removeAttribute('s-each'); child.removeAttribute('@each'); } catch {}
        // mount after placeholder in order
        try { parent.insertBefore(child, ph.nextSibling); } catch {}
        // extended state: prototype chain to parent state
        const ext: any = Object.create(state);
        ext[itemKey] = items[i];
        ext[idxKey] = i;
        const reactive = makeReactive(ext, child);
        rootStateMap.set(child, reactive);
        collectBindingsForRoot(child);
        renderBindings(reactive, child);
        wireEventHandlers(child, reactive);
        created.push(child);
      }
      eachChildren.set(b.el, created);
      continue;
    }
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
  // If this is already one of our proxies, just register the root and return it
  if (reactiveProxies.has(obj as unknown as object)) {
    const roots = proxyRoots.get(obj as unknown as object) || new Set<Element>();
    roots.add(root);
    proxyRoots.set(obj as unknown as object, roots);
    return obj;
  }
  const existing = reactiveCache.get(obj as unknown as object);
  if (existing) {
    // Register this root as another view of the same proxy
    const roots = proxyRoots.get(existing) || new Set<Element>();
    roots.add(root);
    proxyRoots.set(existing, roots);
    return existing as T;
  }
  const proxy = new Proxy(obj as unknown as object, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val === 'function') {
        try { return val.bind(receiver); } catch { return val; }
      }
      if (val && typeof val === "object") {
        return makeReactive(val as any, root);
      }
      return val;
    },
    set(target, prop, value, receiver) {
      const res = Reflect.set(target, prop, value, receiver);
      const roots = proxyRoots.get(proxy) || new Set<Element>([root]);
      proxyRoots.set(proxy, roots);
      roots.forEach((r) => scheduleRender(r));
      return res;
    },
    deleteProperty(target, prop) {
      const res = Reflect.deleteProperty(target, prop);
      const roots = proxyRoots.get(proxy) || new Set<Element>([root]);
      proxyRoots.set(proxy, roots);
      roots.forEach((r) => scheduleRender(r));
      return res;
    },
  });
  reactiveCache.set(obj as unknown as object, proxy);
  reactiveProxies.add(proxy);
  // Register initial root
  proxyRoots.set(proxy, new Set<Element>([root]));
  return proxy as T;
}

// ----------------------------------------
// Binding discovery & event wiring
// ----------------------------------------

function collectBindingsForRoot(root: Element) {
  // Inline template anchors: <div template="id"></div>
  const anchors = Array.from(root.querySelectorAll('[template]')) as Element[];
  for (const el of anchors) {
    const id = el.getAttribute('template');
    if (!id) continue;
    const tpl = document.getElementById(id) as HTMLTemplateElement | null;
    if (tpl && tpl.tagName === 'TEMPLATE') {
      try {
        el.innerHTML = '';
        el.appendChild(tpl.content.cloneNode(true));
        // avoid re-processing this as an anchor repeatedly
        el.removeAttribute('template');
      } catch (e) {
        console.warn('sparkle: failed to mount template anchor', id, e);
      }
    } else {
      console.warn('sparkle: template anchor id not found', id);
    }
  }

  // Mount nested component hosts inside this root (if any)
  const nestedHosts = Array.from(root.querySelectorAll('[use]:not(template):not(script)')) as Element[];
  for (const host of nestedHosts) {
    if (initialized.has(host)) continue;
    const className = (host.getAttribute('use') || '').trim();
    if (!className) continue;
    // Resolve ctor
    const ctor: any = resolveCtor(className);
    if (typeof ctor !== 'function') continue;
    const inherit = host.hasAttribute('inherit');
    let instance: any;
    if (inherit) {
      let par: Element | null = host.parentElement; let inherited: Scope | undefined;
      while (par && !inherited) { const s = rootStateMap.get(par as Element); if (s) inherited = s; par = par.parentElement; }
      instance = inherited ?? {};
    } else {
      try { instance = new ctor({}); } catch { instance = {}; }
    }
    const hostTpl = host.getAttribute('template');
    const staticTpl = (ctor as any).template; const instTpl = (instance as any)?.template;
    const tplId = hostTpl || staticTpl || instTpl;
    if (tplId) {
      const el = document.getElementById(String(tplId)) as HTMLTemplateElement | null;
      if (el && el.tagName === 'TEMPLATE') { host.innerHTML=''; host.appendChild(el.content.cloneNode(true)); }
    }
    initialized.add(host);
    if (!inherit) { try { (instance as any).$el = host; } catch {} }
    const reactive = makeReactive(instance, host);
    rootStateMap.set(host, reactive);
    if (!inherit) componentInstance.set(host, instance);
    // Each nested host will collect its own bindings/events later when init/render runs for it
    // but we call collect/render here to make it eager and ready
    collectBindingsForRoot(host);
    renderBindings(reactive, host);
    wireEventHandlers(host, reactive);
    if (!inherit) { try { (instance as any)?.onMount?.(host) } catch {} }
  }

  // Attribute bindings
  const abinds: AttrBinding[] = [];
  const all = root.querySelectorAll("*");
  all.forEach((el) => {
    for (const { name, value } of Array.from(el.attributes)) {
      // Two-way model shorthand: :value="expr"
      if (name === ':value') {
        abinds.push({ el, attr: 'value', expr: value || "" });
        try { el.setAttribute('data-model', value || ''); el.removeAttribute(name); } catch {}
        continue;
      }
      if (name === 'value') {
        if (hasBraces(value)) {
          abinds.push({ el, attr: name, expr: value || "" });
        }
        continue;
      }
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
    } else {
      // skip any text nodes that live under an @each/s-each template holder
      let cur: Element | null = parent;
      let insideEach = false;
      while (cur) {
        if (cur.hasAttribute && (cur.hasAttribute('s-each') || cur.hasAttribute('@each'))) { insideEach = true; break; }
        cur = cur.parentElement;
      }
      if (!insideEach && t.nodeValue && /\{[^}]+\}/.test(t.nodeValue)) {
        ibinds.push({ node: t, template: t.nodeValue });
      }
    }
    node = walker.nextNode();
  }
  interpBindings.set(root, ibinds);
}

function wireEventHandlers(root: Element, state: Scope) {
  const listeners: { el: Element; event: string; handler: EventListener }[] = [];
  const all = root.querySelectorAll("*");
  all.forEach((el) => {
    // Auto-wire two-way model if present
    if ((el as Element).hasAttribute('data-model')) {
      const path = (el as Element).getAttribute('data-model') || '';
      const tag = el.tagName;
      let evt = 'input';
      if (tag === 'SELECT') evt = 'change';
      if (tag === 'INPUT') {
        const typ = (el as HTMLInputElement).type;
        if (typ === 'checkbox' || typ === 'radio') evt = 'change';
      }
      const handler = (ev: Event) => {
        const t = ev.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        let nv: any;
        if (t instanceof HTMLInputElement && t.type === 'checkbox') {
          nv = t.checked;
        } else if (t instanceof HTMLInputElement && (t.type === 'number' || t.type === 'range')) {
          nv = t.value === '' ? '' : Number(t.value);
        } else {
          nv = (t as any).value;
        }
        assignInScope(path, state, nv);
        scheduleRender(root);
      };
      el.addEventListener(evt, handler as EventListener);
      listeners.push({ el: el as any, event: evt, handler: handler as EventListener });
    }
    for (const { name, value } of Array.from(el.attributes)) {
      if (name.startsWith("on") && name.length > 2) {
        const event = name.slice(2);
        const needsOutside = (value || '').includes('$event.outside');
        const isGlobalKey = event === 'keydown';
        const target: EventTarget = (needsOutside || isGlobalKey) ? document : el;
        const handler = (ev: Event) => {
          const wrapped = new Proxy(ev as any, {
            get(t, p) {
              if (p === 'outside') {
                // Outside relative to the element that declared the handler
                return !(el.contains(ev.target as Node));
              }
              // @ts-ignore
              return t[p];
            }
          });
          evalInScope(value, state, wrapped as any);
          scheduleRender(root);
        };
        // Use capture only for outside click to ensure it fires before element handlers
        const useCapture = needsOutside ? true : false;
        target.addEventListener(event, handler as EventListener, useCapture);
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
    const ctor = resolveCtor(className);
    if (typeof ctor !== 'function') {
      console.warn('sparkle: constructor not found on global scope for', className);
      continue;
    }
    const inherit = host.hasAttribute('inherit');
    const props = parseProps(host);
    let instance: any;
    if (inherit) {
      // find nearest parent root with a state
      let par: Element | null = host.parentElement;
      let inherited: Scope | undefined;
      while (par && !inherited) {
        const s = rootStateMap.get(par as Element);
        if (s) inherited = s;
        par = par.parentElement;
      }
      if (!inherited) {
        console.warn('sparkle: inherit requested but no parent state found for', className);
        try { instance = new ctor(props); } catch { instance = {}; }
      } else {
        instance = inherited;
      }
    } else {
      try { instance = new ctor(props); } catch (e) {
        console.warn('sparkle: error constructing', className, e);
        instance = {};
      }
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
    // Expose host to instance only when not inheriting (avoid clobbering parent's $el)
    if (!inherit) { try { (instance as any).$el = host; } catch {} }
    const reactive = makeReactive(instance, host);
    rootStateMap.set(host, reactive);
    if (!inherit) componentInstance.set(host, instance);

    // Collect bindings & interpolations inside host
    collectBindingsForRoot(host);

    renderBindings(reactive, host);
    // Events
    wireEventHandlers(host, reactive);
    if (!inherit) { try { instance?.onMount?.(host) } catch {} }
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
