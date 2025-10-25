import type { Scope, AttrBinding, InterpBinding } from './types';
import { SKIP_TAGS, DIRECTIVES } from './constants';
import { hasBraces, isInsideEachTemplate } from './utils';

const attrBindings = new WeakMap<Element, AttrBinding[]>();
const interpBindings = new WeakMap<Element, InterpBinding[]>();

export function collectBindingsForRoot(root: Element): void {
  // Inline template anchors: <div template="id"></div>
  collectTemplateAnchors(root);
  
  // Mount nested component hosts inside this root (if any)
  collectNestedComponents(root);
  
  // Attribute bindings
  collectAttributeBindings(root);
  
  // Text interpolations
  collectTextInterpolations(root);
}

function collectTemplateAnchors(root: Element): void {
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
        console.warn('impetus: failed to mount template anchor', id, e);
      }
    } else {
      console.warn('impetus: template anchor id not found', id);
    }
  }
}

function collectNestedComponents(root: Element): void {
  const nestedHosts = Array.from(root.querySelectorAll('[use]:not(template):not(script)')) as Element[];
  for (const host of nestedHosts) {
    const className = (host.getAttribute('use') || '').trim();
    if (!className) continue;
    const inherit = host.hasAttribute('inherit');
    (window as any).mountComponent?.(host, className, inherit);
  }
}

function collectAttributeBindings(root: Element): void {
  const abinds: AttrBinding[] = [];
  const all = [root, ...Array.from(root.querySelectorAll("*"))] as Element[];
  
  all.forEach((el) => {
    // Skip collecting on any element that has an ancestor @each holder.
    if (isInsideEachTemplate(el)) {
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
        // When an element declares @each, skip non-event attrs on template holder
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
}

function collectTextInterpolations(root: Element): void {
  const textBindings: InterpBinding[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  
  while (node) {
    const textNode = node as Text;
    const parent = textNode.parentElement;
    
    if (parent && !SKIP_TAGS.has(parent.tagName)
        && !isInsideEachTemplate(parent)
        && !(parent.hasAttribute('s-each') || parent.hasAttribute('@each'))) {
      if (textNode.nodeValue && /\{[^}]+\}/.test(textNode.nodeValue)) {
        textBindings.push({ node: textNode, template: textNode.nodeValue });
      }
    }
    node = walker.nextNode();
  }
  
  interpBindings.set(root, textBindings);
}

function shouldBindAttr(name: string, value: string | null): boolean {
  if (Object.values(DIRECTIVES).some(set => set.has(name))) return true;
  if (name === "value" || name === "disabled" || name === "checked") return true;
  if (name === "class" || name === "style") return hasBraces(value);
  return hasBraces(value);
}

export function getAttributeBindings(root: Element): AttrBinding[] {
  return attrBindings.get(root) || [];
}

export function getInterpolationBindings(root: Element): InterpBinding[] {
  return interpBindings.get(root) || [];
}

export function clearBindings(root: Element): void {
  attrBindings.delete(root);
  interpBindings.delete(root);
}
