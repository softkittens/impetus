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
const computedCache = new WeakMap<Element, Map<string, { value: any; deps: Set<string> }>>();

/*
|--------------------------------------------------------------------------
| Expression Compilation & Evaluation
|--------------------------------------------------------------------------
| Compile and evaluate JavaScript expressions in component scope using
| the "with" statement. Expressions are cached for performance.
|
*/

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

function evalComputed(expr: string, state: Scope, root: Element): any {
  let cache = computedCache.get(root);
  if (!cache) {
    cache = new Map();
    computedCache.set(root, cache);
  }
  const cached = cache.get(expr);
  if (cached !== undefined) return cached.value;
  const value = evalInScope(expr, state);
  cache.set(expr, { value, deps: new Set() });
  return value;
}

function assignInScope(path: string, state: Scope, value: any) {
  try {
    const segments = String(path).split('.').map(s => s.trim()).filter(Boolean);
    if (!segments.length) return undefined;
    const first = segments[0] as PropertyKey;
    // Find the nearest owner in the prototype chain that defines the first segment
    let owner: any = state;
    let cur: any = state;
    while (cur && !Object.prototype.hasOwnProperty.call(cur, first)) {
      cur = Object.getPrototypeOf(cur);
    }
    if (cur) owner = cur;
    // Resolve target for nested assignment
    let target = owner;
    for (let i = 0; i < segments.length - 1; i++) {
      const k = segments[i] as any;
      if (target == null) return undefined;
      target = target[k];
    }
    const last = segments[segments.length - 1] as any;
    if (target == null) return undefined;
    target[last] = value;
    return value;
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

/*
|--------------------------------------------------------------------------
| DOM Utilities & Normalization
|--------------------------------------------------------------------------
| Helper functions for setting properties, normalizing class/style values,
| and converting between different attribute formats.
|
*/

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

// Directive and attribute constants
const BOOLEAN_ATTRS = new Set([
  "checked","disabled","readonly","required","open","selected","hidden",
  "autofocus","multiple","muted","playsinline","controls"
]);

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE"]);

const DIRECTIVES = {
  IF: new Set(['s-if', '@if']),
  SHOW: new Set(['s-show', '@show']),
  ELSE: new Set(['s-else', '@else']),
  EACH: new Set(['s-each', '@each']),
  TRANSITION: new Set(['s-transition', '@transition'])
};

function hasBraces(v: string | null): boolean {
  return !!(v && v.includes("{"));
}

function isDirective(name: string): boolean {
  return DIRECTIVES.IF.has(name) || DIRECTIVES.SHOW.has(name) || 
         DIRECTIVES.ELSE.has(name) || DIRECTIVES.EACH.has(name) ||
         DIRECTIVES.TRANSITION.has(name);
}

function shouldBindAttr(name: string, value: string | null): boolean {
  if (isDirective(name)) return true;
  if (name === "value" || name === "disabled" || name === "checked") return true;
  if (name === "class" || name === "style") return hasBraces(value);
  return hasBraces(value);
}

/*
|--------------------------------------------------------------------------
| Directive Handlers
|--------------------------------------------------------------------------
| Handle conditional rendering (@if/@else), visibility (@show),
| and list rendering (@each) directives.
|
*/

function scheduleRender(root: Element) {
  if (scheduled.has(root)) return;
  scheduled.add(root);
  // Invalidate computed cache on state change
  computedCache.delete(root);
  queueMicrotask(() => {
    scheduled.delete(root);
    const state = rootStateMap.get(root);
    if (state) renderBindings(state, root);
  });
}

// Attribute binding handlers for cleaner renderBindings
const attrHandlers: Record<string, (el: Element, expr: string, raw: string, state: Scope, root: Element) => boolean> = {
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

// Directive handlers
function handleIfDirective(el: Element, expr: string, state: Scope): void {
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
      try { wireEventHandlers(el, state); } catch {}
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
      try { wireEventHandlers(elseSibling, state); } catch {}
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
}

function findElseSibling(el: Element): Element | null {
  const sibling = el.nextElementSibling;
  if (!sibling) return null;
  if (sibling.hasAttribute('s-else') || sibling.hasAttribute('@else')) return sibling;
  return null;
}

function handleShowDirective(el: Element, expr: string, state: Scope): void {
  const visible = Boolean(evalInScope(expr, state));
  const hasTransition = el.hasAttribute('s-transition') || el.hasAttribute('@transition');
  if (hasTransition) {
    const spec = el.getAttribute('s-transition') || el.getAttribute('@transition') || 'fade';
    applyTransition(el as HTMLElement, spec || 'fade', visible);
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
}

function parseEachExpression(expr: string): { listExpr: string; itemKey: string; idxKey: string } {
  const match = expr.match(/^(.*?)(?:\s+as\s+([a-zA-Z_$][\w$]*)(?:\s*,\s*([a-zA-Z_$][\w$]*))?)?$/);
  return {
    listExpr: (match?.[1] || expr).trim(),
    itemKey: (match?.[2] || 'item').trim(),
    idxKey: (match?.[3] || 'i').trim()
  };
}

function handleEachDirective(el: Element, expr: string, state: Scope, root: Element): void {
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
    try { destroy(child); } catch {}
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
    
    const reactiveState = makeReactive(extendedState, clone);
    rootStateMap.set(clone, reactiveState);
    collectBindingsForRoot(clone);
    renderBindings(reactiveState, clone);
    wireEventHandlers(clone, reactiveState);
    newChildren.push(clone);
  }
  
  eachChildren.set(el, newChildren);
}

function renderBindings(state: Scope, root: Element) {
  const alist = attrBindings.get(root) || [];
  for (const b of alist) {
    const raw = b.expr || "";
    const expr = unwrapExpr(raw);
    const attrName = b.attr;
    
    // Directives
    if (DIRECTIVES.IF.has(attrName)) {
      handleIfDirective(b.el, expr, state);
      continue;
    }
    if (DIRECTIVES.SHOW.has(attrName)) {
      handleShowDirective(b.el, expr, state);
      continue;
    }
    if (DIRECTIVES.ELSE.has(attrName)) {
      continue; // Handled by @if
    }
    if (DIRECTIVES.EACH.has(attrName)) {
      handleEachDirective(b.el, expr, state, root);
      continue;
    }
    if (DIRECTIVES.TRANSITION.has(attrName)) {
      // no-op here; consumed by @show/@if handlers
      continue;
    }
    
    // Use consolidated handlers for special attributes
    const handler = attrHandlers[attrName];
    if (handler && handler(b.el, expr, raw, state, root)) {
      continue;
    }
    
    // Handle value property binding explicitly
    if (attrName === "value") {
      const v = evalInScope(expr, state);
      setValueProp(b.el, v);
      if (v == null || v === false) b.el.removeAttribute("value");
      else b.el.setAttribute("value", String(v));
      continue;
    }
    // Support mixed template replacement for generic attributes
    const rawVal = (b as any).expr as string;
    if (rawVal && rawVal.includes('{') && attrName !== 'class' && attrName !== 'style') {
      const replaced = rawVal.replace(/\{([^}]+)\}/g, (_, ex) => {
        const val = evalInScope(unwrapExpr(String(ex)), state);
        return val == null ? '' : String(val);
      });
      if (replaced === '') {
        b.el.removeAttribute(attrName);
      } else {
        b.el.setAttribute(attrName, replaced);
      }
      continue;
    }
    if (BOOLEAN_ATTRS.has(attrName)) {
      const boolVal = Boolean(evalInScope(expr, state));
      setBooleanProp(b.el, attrName, boolVal);
      if (boolVal) b.el.setAttribute(attrName, "");
      else b.el.removeAttribute(attrName);
      continue;
    }
    // Generic attribute binding
    const gv = evalInScope(expr, state);
    if (gv === false || gv == null) {
      b.el.removeAttribute(attrName);
    } else if (gv === true) {
      b.el.setAttribute(attrName, "");
    } else {
      b.el.setAttribute(attrName, String(gv));
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

/*
|--------------------------------------------------------------------------
| Reactive State Management
|--------------------------------------------------------------------------
| Create reactive proxies that automatically schedule re-renders when
| properties are modified. Supports nested reactivity and multi-root tracking.
|
*/

function isPlainObject(v: any): boolean {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function makeReactive<T extends object>(obj: T, root: Element, isRoot: boolean = false): T {
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
      // Bind only root instance methods so `this` points at the proxy in templates
      if (isRoot && typeof val === 'function') {
        try { return val.bind(receiver); } catch { return val; }
      }
      // Recurse only into plain objects and arrays; leave other instances (Date, Map, DOM, etc.) intact
      if (val && typeof val === 'object') {
        if (Array.isArray(val) || isPlainObject(val)) {
          return makeReactive(val as any, root, false);
        }
      }
      return val;
    },
    set(target, prop, value, receiver) {
      const res = Reflect.set(target, prop, value, receiver);
      const roots = proxyRoots.get(proxy) || new Set<Element>();
      if (roots.size === 0) roots.add(root);
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

/*
|--------------------------------------------------------------------------
| Component Mounting & Props Parsing
|--------------------------------------------------------------------------
| Parse component props from attributes, resolve templates, and mount
| component instances with proper lifecycle hooks.
|
*/

function parseProps(host: Element): Record<string, any> {
  const toCamel = (s: string) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const coerce = (v: string): any => {
    if (v === "true") return true;
    if (v === "false") return false;
    if (v === "null") return null;
    if (v === "undefined") return undefined;
    if (!isNaN(Number(v)) && v.trim() !== "") return Number(v);
    return v;
  };
  let props: Record<string, any> = {};
  const raw = host.getAttribute("props");
  if (raw) {
    try { props = JSON.parse(raw); } catch { console.warn("sparkle: invalid props JSON", raw); }
  }
  for (const { name, value } of Array.from(host.attributes)) {
    if (name === "use" || name === "template" || name === "props") continue;
    const key = name.startsWith("data-") || name.startsWith("aria-") ? name : toCamel(name);
    props[key] = coerce(value);
  }
  return props;
}

function mountComponent(host: Element, className: string, inherit: boolean): void {
  if (initialized.has(host)) return;
  const ctor = resolveCtor(className);
  if (typeof ctor !== 'function') {
    console.warn('sparkle: constructor not found for', className);
    return;
  }
  const props = parseProps(host);
  let instance: any;
  if (inherit) {
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
  initialized.add(host);
  if (!inherit) { try { (instance as any).$el = host; } catch {} }
  // Ensure components see the global shared store in expressions via with(state)
  try { (instance as any).$store = makeReactive((globalThis as any).__sparkleStore || ((globalThis as any).__sparkleStore = {}), host); } catch {}
  const reactive = makeReactive(instance, host, true);
  rootStateMap.set(host, reactive);
  if (!inherit) componentInstance.set(host, instance);
  collectBindingsForRoot(host);
  renderBindings(reactive, host);
  wireEventHandlers(host, reactive);
  if (!inherit) { try { instance?.onMount?.call(reactive, host); } catch {} }
}

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
    const className = (host.getAttribute('use') || '').trim();
    if (!className) continue;
    const inherit = host.hasAttribute('inherit');
    mountComponent(host, className, inherit);
  }

  // Attribute bindings
  const abinds: AttrBinding[] = [];
  const all = [root, ...Array.from(root.querySelectorAll("*"))] as Element[];
  all.forEach((el) => {
    // If this element is inside an @each template holder, skip collecting here.
    // The clone pass will collect bindings per repeated instance.
    const isHolder = el.hasAttribute('s-each') || el.hasAttribute('@each');
    if (!isHolder && isInsideEachTemplate(el)) {
      return;
    }
    const attrs = Array.from(el.attributes);
    const hasEach = attrs.some(a => a.name === 's-each' || a.name === '@each');
    for (const { name, value } of attrs) {
      // Never treat event handlers as attribute bindings
      if (name.startsWith('on')) continue;
      // Skip component infra attributes
      if (name === 'props' || name === 'use' || name === 'template') continue;
      if (hasEach && !(name === 's-each' || name === '@each') && !name.startsWith('on')) {
        // When an element declares @each, skip non-event attrs on template holder (events are wired per clone)
        continue;
      }
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
  const textBindings: InterpBinding[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  
  while (node) {
    const textNode = node as Text;
    const parent = textNode.parentElement;
    
    if (parent && !SKIP_TAGS.has(parent.tagName) && !isInsideEachTemplate(parent)) {
      if (textNode.nodeValue && /\{[^}]+\}/.test(textNode.nodeValue)) {
        textBindings.push({ node: textNode, template: textNode.nodeValue });
      }
    }
    node = walker.nextNode();
  }
  interpBindings.set(root, textBindings);
}

function isInsideEachTemplate(element: Element | null): boolean {
  let current = element;
  while (current) {
    if (current.hasAttribute?.('s-each') || current.hasAttribute?.('@each')) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function wireEventHandlers(root: Element, state: Scope) {
  const listeners: { el: Element; event: string; handler: EventListener }[] = [];
  const all = [root, ...Array.from(root.querySelectorAll("*"))] as Element[];
  all.forEach((el) => {
    // Skip if element has its own state that differs from what we're wiring
    const mapped = rootStateMap.get(el);
    if (mapped && mapped !== state && el !== root) {
      return; // child element managed by different scope
    }
    // Skip elements with @each - they're templates that will be cloned
    if (el.hasAttribute('s-each') || el.hasAttribute('@each')) {
      return;
    }
    // Auto-wire two-way model if present
    if (el.hasAttribute('data-model')) {
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
          scheduleRender(root);
        };
        // Use capture only for outside click to ensure it fires before element handlers
        const useCapture = needsOutside ? true : false;
        let opts: boolean | AddEventListenerOptions | undefined;
        if (mods.has('once') && useCapture) opts = { capture: true, once: true };
        else if (mods.has('once')) opts = { once: true };
        else if (useCapture) opts = true; // boolean capture shorthand
        target.addEventListener(event, handler as EventListener, opts);
        listeners.push({ el: target as any, event, handler: handler as EventListener });
        // no manual once listener needed; AddEventListenerOptions.once handles it
        // remove inline to avoid global-scope eval
        try { el.removeAttribute(name); } catch {}
      }
    }
  });
  if (listeners.length) listenerMap.set(root, listeners);
}

/*
|--------------------------------------------------------------------------
| Initialization & Cleanup
|--------------------------------------------------------------------------
| Initialize components and scoped elements, wire up reactivity,
| and provide cleanup for unmounting.
|
*/

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

  const state = makeReactive(initial, root, true);
  rootStateMap.set(root, state);
  try { (state as any).$store = makeReactive((globalThis as any).__sparkleStore || ((globalThis as any).__sparkleStore = {}), root); } catch {}

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
    const inherit = host.hasAttribute('inherit');
    mountComponent(host, className, inherit);
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

// Simple transitions (fade[:durationMs]) applied by @show/@transition
function applyTransition(el: HTMLElement, spec: string, show: boolean) {
  const [type, durStr] = String(spec || 'fade').split(':');
  const dur = Math.max(0, Number(durStr || 150)) || 150;
  if (type !== 'fade') {
    if (show) {
      el.removeAttribute('hidden'); el.removeAttribute('aria-hidden'); el.style.removeProperty('display');
    } else {
      el.setAttribute('hidden',''); el.setAttribute('aria-hidden','true'); el.style.display = 'none';
    }
    return;
  }
  el.style.transition = `opacity ${dur}ms ease`;
  if (show) {
    el.removeAttribute('hidden'); el.removeAttribute('aria-hidden'); el.style.removeProperty('display');
    el.style.opacity = '0';
    requestAnimationFrame(() => { el.style.opacity = '1'; setTimeout(() => { el.style.transition = ''; }, dur); });
  } else {
    el.style.opacity = '1';
    requestAnimationFrame(() => {
      el.style.opacity = '0';
      setTimeout(() => { el.setAttribute('hidden',''); el.setAttribute('aria-hidden','true'); el.style.display = 'none'; el.style.transition = ''; }, dur);
    });
  }
}
