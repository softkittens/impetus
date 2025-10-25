import type { Scope } from './types';
import { resolveCtor } from './expression';
import { parseProps } from './utils';
import { stateManager } from './state';

const componentInstance = new WeakMap<Element, any>();
const initialized = new WeakSet<Element>();

export function mountComponent(host: Element, className: string, inherit: boolean): void {
  if (initialized.has(host)) return;
  
  const ctor = resolveCtor(className);
  if (typeof ctor !== 'function') {
    console.warn('impetus: constructor not found for', className);
    return;
  }
  
  const props = parseProps(host);
  let instance: any;
  
  if (inherit) {
    let par: Element | null = host.parentElement;
    let inherited: Scope | undefined;
    while (par && !inherited) {
      const s = stateManager.getRootState(par as Element);
      if (s) inherited = s;
      par = par.parentElement;
    }
    if (!inherited) {
      console.warn('impetus: inherit requested but no parent state found for', className);
      try { instance = new ctor(props); } catch { instance = {}; }
    } else {
      instance = inherited;
    }
  } else {
    try { instance = new ctor(props); } catch (e) {
      console.warn('impetus: error constructing', className, e);
      instance = {};
    }
  }
  
  // Template resolution
  resolveTemplate(host, ctor, instance);
  
  initialized.add(host);
  if (!inherit) { try { (instance as any).$el = host; } catch {} }
  
  // Ensure components see the global shared store in expressions via with(state)
  try { 
    (instance as any).$store = (window as any).makeReactive?.(
      (globalThis as any).__impetusStore || ((globalThis as any).__impetusStore = {}), 
      host
    ); 
  } catch {}
  
  const reactive = (window as any).makeReactive?.(instance, host, true);
  stateManager.setRootState(host, reactive);
  if (!inherit) componentInstance.set(host, instance);
  
  try { (window as any).devhooks?.onInitRoot?.(host, reactive); } catch {}
  stateManager.addRoot(host);
  
  (window as any).collectBindingsForRoot?.(host);
  (window as any).renderBindings?.(reactive, host);
  (window as any).wireEventHandlers?.(host, reactive);
  
  if (!inherit) { try { instance?.onMount?.call(reactive, host); } catch {} }
}

function resolveTemplate(host: Element, ctor: any, instance: any): void {
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
      console.warn('impetus: template id not found', tplId);
    }
  }
}

export function isComponentInitialized(host: Element): boolean {
  return initialized.has(host);
}

export function getComponentInstance(host: Element): any {
  return componentInstance.get(host);
}

export function destroyComponent(host: Element): void {
  try { (componentInstance.get(host) as any)?.onDestroy?.() } catch {}
  componentInstance.delete(host);
  initialized.delete(host);
}
