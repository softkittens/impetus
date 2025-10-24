// src/runtime.ts
var attrBindings = new WeakMap;
var interpBindings = new WeakMap;
var exprCache = new Map;
var rootStateMap = new WeakMap;
var scheduled = new WeakSet;
var initialized = new WeakSet;
var listenerMap = new WeakMap;
var reactiveCache = new WeakMap;
var componentInstance = new WeakMap;
var ctorCache = new Map;
function compile(expr) {
  let fn = exprCache.get(expr);
  if (!fn) {
    fn = new Function("state", "$event", `with(state){ return ( ${expr} ) }`);
    exprCache.set(expr, fn);
  }
  return fn;
}
function evalInScope(expr, state, $event) {
  try {
    const fn = compile(expr);
    return fn(state, $event);
  } catch (e) {
    console.warn("sparkle: eval error", expr, e);
    return;
  }
}
function setBooleanProp(el, prop, v) {
  try {
    el[prop] = Boolean(v);
  } catch {}
}
function setValueProp(el, v) {
  try {
    el.value = v == null ? "" : String(v);
  } catch {}
}
function normalizeClass(v) {
  if (!v)
    return "";
  if (typeof v === "string")
    return v;
  if (Array.isArray(v))
    return v.filter(Boolean).map(String).join(" ");
  if (typeof v === "object")
    return Object.keys(v).filter((k) => v[k]).join(" ");
  return String(v);
}
function toKebab(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase();
}
function normalizeStyle(v) {
  if (!v)
    return "";
  if (typeof v === "string")
    return v;
  if (typeof v === "object") {
    return Object.entries(v).filter(([, val]) => val != null && val !== false).map(([k, val]) => `${toKebab(k)}:${String(val)}`).join(";");
  }
  return String(v);
}
function scheduleRender(root) {
  if (scheduled.has(root))
    return;
  scheduled.add(root);
  queueMicrotask(() => {
    scheduled.delete(root);
    const state = rootStateMap.get(root);
    if (state)
      renderBindings(state, root);
  });
}
function renderBindings(state, root) {
  const alist = attrBindings.get(root) || [];
  for (const b of alist) {
    const v = evalInScope(b.expr, state);
    const attrName = b.attr;
    if (attrName === "class") {
      const cls = normalizeClass(v);
      if (cls)
        b.el.setAttribute("class", cls);
      else
        b.el.removeAttribute("class");
      continue;
    }
    if (attrName === "style") {
      const st = normalizeStyle(v);
      if (st)
        b.el.setAttribute("style", st);
      else
        b.el.removeAttribute("style");
      continue;
    }
    if (attrName === "value") {
      setValueProp(b.el, v);
      if (v == null || v === false)
        b.el.removeAttribute("value");
      else
        b.el.setAttribute("value", String(v));
      continue;
    }
    if (attrName === "checked" || attrName === "disabled" || attrName === "readonly" || attrName === "required" || attrName === "open" || attrName === "selected" || attrName === "hidden" || attrName === "autofocus" || attrName === "multiple" || attrName === "muted" || attrName === "playsinline" || attrName === "controls") {
      const boolVal = Boolean(v);
      setBooleanProp(b.el, attrName, boolVal);
      if (boolVal)
        b.el.setAttribute(attrName, "");
      else
        b.el.removeAttribute(attrName);
      continue;
    }
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
    const placeholderL = "\x00LBRACE\x00";
    const placeholderR = "\x00RBRACE\x00";
    const tpl = b.template.replace(/\{\{/g, placeholderL).replace(/\}\}/g, placeholderR);
    const rendered = tpl.replace(/\{([^}]+)\}/g, (_, expr) => {
      const v = evalInScope(String(expr).trim(), state);
      return v == null ? "" : String(v);
    }).replace(new RegExp(placeholderL, "g"), "{").replace(new RegExp(placeholderR, "g"), "}");
    b.node.textContent = rendered;
  }
}
function makeReactive(obj, root) {
  if (obj === null || typeof obj !== "object")
    return obj;
  const existing = reactiveCache.get(obj);
  if (existing)
    return existing;
  const proxy = new Proxy(obj, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (val && typeof val === "object") {
        return makeReactive(val, root);
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
    }
  });
  reactiveCache.set(obj, proxy);
  return proxy;
}
function setupScope(root) {
  const attr = root.getAttribute("scope");
  let initial = {};
  if (attr && attr.trim()) {
    try {
      initial = JSON.parse(attr);
    } catch (e) {
      console.warn("sparkle: invalid scope JSON", e);
      initial = {};
    }
  }
  if (initialized.has(root))
    return;
  initialized.add(root);
  const state = makeReactive(initial, root);
  rootStateMap.set(root, state);
  const abinds = [];
  const all = root.querySelectorAll("*");
  all.forEach((el) => {
    for (const { name, value } of Array.from(el.attributes)) {
      if (name === "disabled" || name === "checked" || name === "value") {
        abinds.push({ el, attr: name, expr: value || "" });
      } else if (name === "class" || name === "style") {
        if ((value || "").includes("{")) {
          abinds.push({ el, attr: name, expr: value || "" });
        }
      }
    }
  });
  attrBindings.set(root, abinds);
  const ibinds = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const t = node;
    const parent = t.parentElement;
    if (parent && ["SCRIPT", "STYLE", "TEMPLATE"].includes(parent.tagName)) {} else if (t.nodeValue && /\{[^}]+\}/.test(t.nodeValue)) {
      ibinds.push({ node: t, template: t.nodeValue });
    }
    node = walker.nextNode();
  }
  interpBindings.set(root, ibinds);
  renderBindings(state, root);
  const listeners = [];
  all.forEach((el) => {
    for (const { name, value } of Array.from(el.attributes)) {
      if (name.startsWith("on") && name.length > 2) {
        const event = name.slice(2);
        const handler = (ev) => {
          evalInScope(value, state, ev);
          scheduleRender(root);
        };
        el.addEventListener(event, handler);
        listeners.push({ el, event, handler });
        try {
          el.removeAttribute(name);
        } catch {}
      }
    }
  });
  if (listeners.length)
    listenerMap.set(root, listeners);
}
function init(selector = "[scope]") {
  if (typeof document === "undefined")
    return;
  const nodes = Array.from(document.querySelectorAll(selector));
  nodes.forEach((n) => setupScope(n));
  function toCamel(s) {
    return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }
  function coerce(v) {
    if (v === "true")
      return true;
    if (v === "false")
      return false;
    if (v === "null")
      return null;
    if (v === "undefined")
      return;
    if (!isNaN(Number(v)) && v.trim() !== "")
      return Number(v);
    return v;
  }
  function parseProps(host) {
    let props = {};
    const raw = host.getAttribute("props");
    if (raw) {
      try {
        props = JSON.parse(raw);
      } catch {
        console.warn("sparkle: invalid props JSON", raw);
      }
    }
    for (const { name, value } of Array.from(host.attributes)) {
      if (name === "use" || name === "template" || name === "props")
        continue;
      const key = name.startsWith("data-") || name.startsWith("aria-") ? name : toCamel(name);
      props[key] = coerce(value);
    }
    return props;
  }
  const hosts = Array.from(document.querySelectorAll("[use]:not(template):not(script)"));
  for (const host of hosts) {
    let resolveCtor = function(name) {
      const g = globalThis[name];
      if (typeof g === "function")
        return g;
      if (ctorCache.has(name))
        return ctorCache.get(name);
      try {
        const scripts = Array.from(document.querySelectorAll("script"));
        const code = scripts.filter((s) => !s.type || s.type === "text/javascript").map((s) => s.textContent || "").join(`
`);
        const found = new Function(`return (function(){
` + code + `
;try { return typeof ${name}==='function' ? ${name} : null } catch(_) { return null }
})()`)();
        if (typeof found === "function") {
          ctorCache.set(name, found);
          return found;
        }
      } catch (e) {
        console.warn("sparkle: ctor eval error for", name, e);
      }
      return;
    };
    const className = (host.getAttribute("use") || "").trim();
    if (!className)
      continue;
    const ctor = resolveCtor(className);
    if (typeof ctor !== "function") {
      console.warn("sparkle: constructor not found on global scope for", className);
      continue;
    }
    const props = parseProps(host);
    let instance;
    try {
      instance = new ctor(props);
    } catch (e) {
      console.warn("sparkle: error constructing", className, e);
      instance = {};
    }
    const hostTpl = host.getAttribute("template");
    const staticTpl = ctor.template;
    const instTpl = instance?.template;
    const tplId = hostTpl || staticTpl || instTpl;
    if (tplId) {
      const tplEl = document.getElementById(String(tplId));
      if (tplEl && tplEl.tagName === "TEMPLATE") {
        host.innerHTML = "";
        host.appendChild(tplEl.content.cloneNode(true));
      } else {
        console.warn("sparkle: template id not found", tplId);
      }
    }
    if (initialized.has(host))
      continue;
    initialized.add(host);
    const reactive = makeReactive(instance, host);
    rootStateMap.set(host, reactive);
    componentInstance.set(host, instance);
    const abinds = [];
    const all = host.querySelectorAll("*");
    all.forEach((el) => {
      for (const { name: aname, value } of Array.from(el.attributes)) {
        if (aname === "disabled" || aname === "checked" || aname === "value") {
          abinds.push({ el, attr: aname, expr: value || "" });
        } else if (aname === "class" || aname === "style") {
          if ((value || "").includes("{")) {
            abinds.push({ el, attr: aname, expr: value || "" });
          }
        }
      }
    });
    attrBindings.set(host, abinds);
    const ibinds = [];
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const t = node;
      const parent = t.parentElement;
      if (parent && ["SCRIPT", "STYLE", "TEMPLATE"].includes(parent.tagName)) {} else if (t.nodeValue && /\{[^}]+\}/.test(t.nodeValue)) {
        ibinds.push({ node: t, template: t.nodeValue });
      }
      node = walker.nextNode();
    }
    interpBindings.set(host, ibinds);
    renderBindings(reactive, host);
    const listeners = [];
    all.forEach((el) => {
      for (const { name: aname, value } of Array.from(el.attributes)) {
        if (aname.startsWith("on") && aname.length > 2) {
          const event = aname.slice(2);
          const handler = (ev) => {
            evalInScope(value, reactive, ev);
            scheduleRender(host);
          };
          el.addEventListener(event, handler);
          listeners.push({ el, event, handler });
          try {
            el.removeAttribute(aname);
          } catch {}
        }
      }
    });
    if (listeners.length)
      listenerMap.set(host, listeners);
    try {
      instance?.onMount?.();
    } catch {}
  }
}
function destroy(root) {
  const listeners = listenerMap.get(root) || [];
  for (const { el, event, handler } of listeners) {
    el.removeEventListener(event, handler);
  }
  listenerMap.delete(root);
  attrBindings.delete(root);
  interpBindings.delete(root);
  rootStateMap.delete(root);
  scheduled.delete(root);
  initialized.delete(root);
  try {
    componentInstance.get(root)?.onDestroy?.();
  } catch {}
}
export {
  init,
  destroy
};
