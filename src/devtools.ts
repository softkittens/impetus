// Minimal Sparkle devtools (Phase 1.5)
// - Registers runtime hooks and logs activity
// - Adds overlay highlighter and a tiny panel (toggle: Alt+S / Alt+H)

import { setDevtoolsHooks, __dev_get_roots, __dev_get_state, __dev_get_bindings, init } from './runtime';

type RootStats = { renders: number; lastMs: number };
const state: {
  roots: Set<Element>;
  stats: Map<Element, RootStats>;
  selectedRoot: Element | null;
  selectedEl: Element | null;
  pickMode: boolean;
} = {
  roots: new Set(),
  stats: new Map(),
  selectedRoot: null,
  selectedEl: null,
  pickMode: false,
};

// Overlay
let overlay: HTMLDivElement | null = null;
function ensureOverlay(): HTMLDivElement {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '2147483647';
  overlay.style.border = '2px solid rgba(0,128,255,0.7)';
  overlay.style.background = 'rgba(0,128,255,0.08)';
  overlay.style.borderRadius = '4px';
  overlay.style.display = 'none';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(overlay!));
  return overlay;
}
function highlight(el: Element | null) {
  const o = ensureOverlay();
  if (!el || !(el as any).getBoundingClientRect) { o.style.display = 'none'; return; }
  const r = (el as any).getBoundingClientRect();
  o.style.display = 'block';
  o.style.left = `${r.left + window.scrollX}px`;
  o.style.top = `${r.top + window.scrollY}px`;
  o.style.width = `${r.width}px`;
  o.style.height = `${r.height}px`;
}

// Hooks (update Sparkle panel state)
setDevtoolsHooks({
  onInitRoot(root) {
    if (root === devtoolsHostEl) return;
    state.roots.add(root);
    try { const p = getPanelState(); if (p) p._pulse = (p._pulse || 0) + 1; } catch {}
  },
  onCollect() {},
  onRenderStart() {},
  onRenderEnd(root, { duration }) {
    if (root === devtoolsHostEl) return;
    const prev = state.stats.get(root) || { renders: 0, lastMs: 0 };
    prev.renders += 1; prev.lastMs = duration || 0; state.stats.set(root, prev);
    try {
      const p = getPanelState();
      if (p) { p._updateMetrics?.(); p._refreshBindingsAndState?.(); p._pulse = (p._pulse || 0) + 1; }
    } catch {}
  },
  onDirective(el) {
    highlight(el);
    setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 150);
  },
  onWireEvents() {},
  onDestroy(root) {
    if (root === devtoolsHostEl) return;
    state.roots.delete(root);
    state.stats.delete(root);
    try { const p = getPanelState(); if (p) p._pulse = (p._pulse || 0) + 1; } catch {}
  },
});

console.info('[sparkle:devtools] panel ready (click chip to toggle)');

// (Picker removed) Rely on dropdown to change roots

// Recent events capture (simple, dev-only)
const recentEvents = new Map<Element, Array<{ type: string; ts: number }>>();
function pushEvent(el: Element, type: string) {
  if (!el) return;
  const arr = recentEvents.get(el) || [];
  arr.unshift({ type, ts: Date.now() });
  if (arr.length > 8) arr.pop();
  recentEvents.set(el, arr);
}
['click','input','change','keydown'].forEach((etype) => {
  document.addEventListener(etype, (e) => {
    const t = e.target as Element | null; if (!t) return;
    // bubble up to bound ancestor to make it useful
    let cur: Element | null = t;
    while (cur) { pushEvent(cur, etype); cur = cur.parentElement; }
  }, true);
});

//
// Sparkle-driven Devtools Panel (component + template)
//
let sparkMounted = false;
let devtoolsHostEl: Element | null = null;
let devDesiredOpen = true;
function getPanelState(): any {
  try { return panelRef || (devtoolsHostEl ? __dev_get_state(devtoolsHostEl) : null); } catch { return null; }
}
function bootstrapSparkleDevtoolsWithSparkle() {
  if (sparkMounted) return; sparkMounted = true;
  // Template
  const tpl = document.createElement('template');
  tpl.id = 'sparkle-devtools';
  tpl.innerHTML = `
  <div @if="open" style="position:fixed;right:12px;bottom:64px;z-index:2147483647;min-width:240px;max-width:360px;background:rgba(17,24,39,0.96);color:#e5e7eb;border:1px solid #374151;border-radius:8px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1);padding:8px 10px;">
    <div style="display:flex;align-items:center;gap:8px;justify-content:space-between;">
      <div style="font-weight:600;">Sparkle Dev</div>
      <div style="display:flex;gap:6px;align-items:center;">
        <button style="background:#111827;color:#9ca3af;border:1px solid #374151;border-radius:6px;padding:2px 6px;cursor:pointer;" onclick="onClose()">×</button>
      </div>
    </div>
    <div style="display:flex;gap:6px;margin-top:6px;align-items:center;">
      <select style="flex:1;background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:6px;padding:2px 4px;" onchange="onRootChange($event)">
        <option @each="roots as r,i">{r}</option>
      </select>
    </div>
    <div style="display:flex;gap:6px;margin-top:6px;">
      <button style="flex:1;background:{ tab==='state' ? '#1f2937' : '#111827' };color:{ tab==='state' ? '#e5e7eb' : '#9ca3af' };border:1px solid #374151;border-radius:6px;padding:4px;cursor:pointer;" onclick="tab='state'">State</button>
      <button style="flex:1;background:{ tab==='elements' ? '#1f2937' : '#111827' };color:{ tab==='elements' ? '#e5e7eb' : '#9ca3af' };border:1px solid #374151;border-radius:6px;padding:4px;cursor:pointer;" onclick="tab='elements'">Elements</button>
    </div>
    <div style="margin-top:6px;display:grid;gap:6px;max-height:300px;overflow:auto;">
      <div style="display:none">{_pulse}</div>
      <div>roots: {roots.length} · last: {Math.round(lastMs)}ms</div>
      <div @if="tab==='elements'">
        <div style="display:flex;gap:6px;align-items:center;">
          <input type="text" placeholder="Filter..." oninput="onFilter($event)" value="{filterText}" style="flex:1;background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:6px;padding:4px 6px;" />
        </div>
        <div style="display:grid;grid-template-columns: 1fr 1fr; gap:8px; margin-top:8px; min-height:160px;">
          <div style="display:flex;flex-direction:column;gap:4px;overflow:auto;max-height:260px;border:1px solid #374151;border-radius:6px;padding:6px;">
            <div @each="nodesFiltered as n,ni" style="display:flex;align-items:center;justify-content:space-between;gap:6px;border:1px solid { ni===selectedNodeIndex ? '#60a5fa' : '#374151' };border-radius:6px;padding:4px;cursor:pointer;" onclick="onSelectNode(ni)" onmouseenter="onHoverNode(n)" onmouseleave="onUnhoverNode()">
              <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">{labelNode(n)}</div>
              <div style="display:flex;gap:6px;color:#9ca3af;">
                <span>attr:{countAttr(n)}</span>
                <span>txt:{countText(n)}</span>
              </div>
            </div>
          </div>
          <div style="border:1px solid #374151;border-radius:6px;padding:6px;overflow:auto;max-height:260px;">
            <div @if="selectedNode">
              <div style="font-weight:600;">{labelNode(selectedNode)}</div>
              <div style="display:flex;gap:6px;margin-top:6px;">
                <button style="background:#1f2937;color:#e5e7eb;border:1px solid #374151;border-radius:6px;padding:2px 6px;cursor:pointer;" onclick="scrollToNode()">Scroll into view</button>
              </div>
              <div style="margin-top:6px;">
                <div style="font-weight:600;">Attribute bindings</div>
                <div @if="nodeBindings(selectedNode).attrs.length===0" style="color:#9ca3af;">None</div>
                <div @each="nodeBindings(selectedNode).attrs as b,bi" style="border:1px solid #374151;border-radius:6px;padding:4px;margin-top:4px;">
                  <div>{b.attr} = {b.expr}</div>
                  <div style="color:#9ca3af;">→ current: {currentAttr(b)}</div>
                  <div style="margin-top:4px;color:#9ca3af;">deps: {depsJoined(b.expr)}</div>
                </div>
              </div>
              <div style="margin-top:6px;">
                <div style="font-weight:600;">Text bindings</div>
                <div @if="nodeBindings(selectedNode).interps.length===0" style="color:#9ca3af;">None</div>
                <div @each="nodeBindings(selectedNode).interps as t,ti" style="border:1px solid #374151;border-radius:6px;padding:4px;margin-top:4px;">
                  <div>{t.template}</div>
                  <div style="color:#9ca3af;">→ current: {currentText(t)}</div>
                  <div style="margin-top:4px;color:#9ca3af;">deps: {depsJoinedText(t.template)}</div>
                </div>
              </div>
              <div style="margin-top:6px;">
                <div style="font-weight:600;">Recent events</div>
                <div @if="eventsFor(selectedNode).length===0" style="color:#9ca3af;">None</div>
                <div @each="eventsFor(selectedNode) as ev,ei" style="color:#9ca3af;">{ev.type} · {Math.round((Date.now()-ev.ts)/1000)}s ago</div>
              </div>
            </div>
            <div @if="!selectedNode" style="color:#9ca3af;">Select an element</div>
          </div>
        </div>
      </div>
      <div @if="tab==='state'">
        <div style="font-weight:600;">State (auto-apply)</div>
        <textarea id="sparkle-dev-state" oninput="onEdit($event)" onfocus="onStartEdit()" onblur="onStopEdit()" style="width:100%;height:200px;background:#111827;border:1px solid #374151;color:#e5e7eb;border-radius:6px;padding:6px;font-family:monospace;font-size:11px;">{stateText}</textarea>
      </div>
      
    </div>
    <div style="margin-top:6px;padding-top:6px;border-top:1px solid #374151;display:flex;gap:8px;align-items:center;justify-content:space-between;color:#9ca3af;">
      <div>renders: {rendersCount}</div>
      <div>last: {Math.round(lastMsVal)}ms</div>
    </div>
  </div>`;
  document.body.appendChild(tpl);
  // Host + chip
  const host = document.createElement('div');
  host.setAttribute('use', 'DevPanel'); host.setAttribute('template', 'sparkle-devtools');
  document.body.appendChild(host);
  devtoolsHostEl = host;
  const chip = document.createElement('div');
  chip.textContent = '✨';
  chip.style.position = 'fixed'; chip.style.right = '12px'; chip.style.bottom = '12px'; chip.style.zIndex = '2147483647';
  chip.style.background = '#111827'; chip.style.color = '#e5e7eb'; chip.style.border = '1px solid #374151'; chip.style.borderRadius = '999px'; chip.style.padding = '8px 12px'; chip.style.cursor = 'pointer'; chip.style.fontSize = '20px';
  chip.onclick = () => {
    devDesiredOpen = true;
    let p = getPanelState();
    if (!p) { try { init(); panelRef = __dev_get_state(host) as any; } catch {} p = getPanelState(); }
    if (p) { p.open = true; p._pulse = (p._pulse || 0) + 1; }
  };
  document.body.appendChild(chip);

  // Component
  (globalThis as any).DevPanel = class DevPanel {
    static template = 'sparkle-devtools';
    open: boolean = true;
    // always-on devtools
    tab: string = 'state';
    filterText: string = '';
    selectedNodeIndex: number = -1;
    selectedIndex: number = 0;
    stateText: string = '';
    autoApply: boolean = true;
    _pulse: number = 0;
    _editing: boolean = false;
    rendersCount: number = 0;
    lastMsVal: number = 0;
    _syncTextarea() {
      try {
        const ta = document.querySelector('#sparkle-dev-state') as HTMLTextAreaElement | null;
        if (ta && !this._editing) {
          const isActive = document.activeElement === ta;
          const selStart = ta.selectionStart ?? 0;
          const selEnd = ta.selectionEnd ?? 0;
          ta.value = this.stateText || '';
          if (isActive) {
            const len = ta.value.length;
            ta.selectionStart = Math.min(selStart, len);
            ta.selectionEnd = Math.min(selEnd, len);
          }
        }
      } catch {}
    }
    _updateMetrics() {
      const roots = this._rootsArr(); const root = roots[this.selectedIndex];
      const s = root ? state.stats.get(root) : undefined;
      this.rendersCount = (s?.renders) || 0;
      this.lastMsVal = (s?.lastMs) || 0;
    }
    // Elements tab helpers
    _bindingsAll() { const root = this._rootsArr()[this.selectedIndex]; return root ? __dev_get_bindings(root) : { attrs:[], interps:[] } }
    _nodesWithBindings(): Element[] {
      const { attrs, interps } = this._bindingsAll();
      const set = new Set<Element>();
      attrs.forEach((b:any)=> { if (b?.el) set.add(b.el); });
      interps.forEach((t:any)=> { const el = t?.node?.parentElement; if (el) set.add(el); });
      return Array.from(set);
    }
    labelNode(n: Element | null | undefined) { try { return n ? this._label(n) : '(none)'; } catch { return '(unknown)'; } }
    countAttr(n: Element) { return this._bindingsAll().attrs.filter((b:any)=> b && b.el===n).length }
    countText(n: Element) { return this._bindingsAll().interps.filter((t:any)=> (t?.node?.parentElement)===n).length }
    nodeBindings(n: Element) {
      const all = this._bindingsAll();
      const attrs = all.attrs.filter((b:any)=> b && b.el===n);
      const interps = all.interps.filter((t:any)=> (t?.node?.parentElement)===n);
      return { attrs, interps };
    }
    get nodesFiltered() {
      const items = this._nodesWithBindings();
      const q = (this.filterText||'').toLowerCase();
      if (!q) return items;
      return items.filter(n => this._label(n).toLowerCase().includes(q));
    }
    get selectedNode() { const list = this.nodesFiltered; return list[this.selectedNodeIndex] }
    onSelectNode(i: number) { this.selectedNodeIndex = i }
    onFilter($event:any) { this.filterText = String($event.target.value||''); }
    onHoverNode(n: Element) { highlight(n); }
    onUnhoverNode() { if (overlay) overlay.style.display = 'none' }
    scrollToNode() { try { this.selectedNode?.scrollIntoView({ block:'center', inline:'center', behavior:'smooth' }); } catch {} }
    currentAttr(b: any) {
      try {
        const el = b.el as any; const name = b.attr;
        if (name in el && typeof el[name] !== 'function') return String(el[name]);
        const v = (b.el as Element).getAttribute(name); return v==null ? '' : String(v);
      } catch { return '' }
    }
    currentText(t: any) { try { return String((t?.node as Text)?.textContent || '') } catch { return '' } }
    deps(expr: string) {
      try {
        const stop = new Set(['true','false','null','undefined','NaN','Infinity','Math','Date','Array','Object','String','Number','Boolean','console','event','window','document']);
        const ids = Array.from(new Set((expr.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || []).filter(x => !stop.has(x))));
        return ids.slice(0,8);
      } catch { return [] }
    }
    depsText(template: string) {
      try {
        const out = new Set<string>();
        const re = /\{([^}]+)\}/g; let m: RegExpExecArray | null;
        while ((m = re.exec(String(template))) !== null) {
          const ids = this.deps(m[1] || ''); ids.forEach((id:string)=> out.add(id));
        }
        return Array.from(out).slice(0, 8);
      } catch { return []; }
    }
    depsJoined(expr: string) {
      try { return this.deps(expr).join(', '); } catch { return ''; }
    }
    depsJoinedText(template: string) {
      try { return this.depsText(template).join(', '); } catch { return ''; }
    }
    onJumpToKey(key: string) {
      try {
        const ta = document.querySelector('#sparkle-dev-state') as HTMLTextAreaElement | null;
        if (!ta) return;
        const idx = (ta.value || '').indexOf(`"${key}"`);
        if (idx >= 0) { ta.focus(); ta.selectionStart = idx; ta.selectionEnd = idx + key.length + 2; }
      } catch {}
    }
    eventsFor(n: Element | undefined) { if (!n) return []; return recentEvents.get(n) || [] }
    constructor() {
      this.roots = this._listRoots();
      this.stateText = this._stateText();
      this.open = devDesiredOpen;
      this._syncTextarea();
      this._updateMetrics();
    }
    toggle() { this.open = !this.open; devDesiredOpen = this.open; }
    onClose() { this.open = false; devDesiredOpen = false; }
    onRootChange($event: any) { this.selectedIndex = Number($event.target.selectedIndex) || 0; this._refreshBindingsAndState(); }
    onStartEdit() { this._editing = true; }
    onStopEdit() { this._editing = false; this._refreshBindingsAndState(); }
    applyState() {
      try {
        const roots = __dev_get_roots(); const root = roots[this.selectedIndex]; if (!root) return;
        const next = JSON.parse(this.stateText || '{}'); const live = __dev_get_state(root) as any; if (!live) return;
        Object.keys(next || {}).forEach(k => { (live as any)[k] = (next as any)[k]; });
      } catch (e) { console.warn('[sparkle:devtools] bad JSON', e); }
    }
    onEdit($event: any) {
      const val = String($event.target.value || '');
      this.stateText = val;
      try {
        const roots = this._rootsArr(); const root = roots[this.selectedIndex]; if (!root) return;
        const next = JSON.parse(val || '{}'); const live = __dev_get_state(root) as any; if (!live) return;
        Object.keys(next || {}).forEach(k => { (live as any)[k] = (next as any)[k]; });
        this._pulse++;
      } catch {}
    }
    _rootsArr(): Element[] { const arr = __dev_get_roots(); return devtoolsHostEl ? arr.filter(r => r !== devtoolsHostEl) : arr }
    _label(r: Element): string {
      if (!r || !(r as any).getAttribute) {
        try { return (r as any)?.tagName ? String((r as any).tagName).toLowerCase() : '(node)'; } catch { return '(node)'; }
      }
      const use = r.getAttribute && r.getAttribute('use');
      if (use && use.trim()) return `${use}`;
      const id = (r as HTMLElement).id ? `#${(r as HTMLElement).id}` : '';
      return `${r.tagName.toLowerCase()}${id}`;
    }
    _listRoots(): string[] { return this._rootsArr().map(r => this._label(r)); }
    _bindings() { const root = this._rootsArr()[this.selectedIndex]; return root ? __dev_get_bindings(root) : { attrs:[], interps:[] } }
    _stateText() { const root = this._rootsArr()[this.selectedIndex]; const s = (root ? __dev_get_state(root) : {}) || {}; return JSON.stringify(s, (_k,v)=>{ if(v instanceof Element)return `<${v.tagName.toLowerCase()}>`; if(typeof v==='function') return '[Function]'; return v; }, 2) }
    _refreshBindingsAndState() {
      const newText = this._stateText();
      if (!this._editing) this.stateText = newText;
      this._updateMetrics();
      this._pulse++;
      this._syncTextarea();
    }
    // deprecated
    get bindings() { return this._bindings() }
    get renders() { const roots = this._rootsArr(); const root = roots[this.selectedIndex]; const s = root ? state.stats.get(root) : undefined; return (s?.renders)||0; }
    get lastMs() { const roots = this._rootsArr(); const root = roots[this.selectedIndex]; const s = root ? state.stats.get(root) : undefined; return (s?.lastMs)||0; }
    get roots() { return this._listRoots() }
    set roots(_v: any){}
  }
  // Mount sparkle for this host only
  try { init(); panelRef = __dev_get_state(host) as any; } catch {}
}

let panelRef: any = null;
document.addEventListener('DOMContentLoaded', bootstrapSparkleDevtoolsWithSparkle);
