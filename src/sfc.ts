/**
 * IMPETUS FRAMEWORK - SFC-lite Module
 * 
 * Handles Single File Component (SFC) loading and definition.
 * Components are defined in external HTML files and loaded via src attribute.
 */

import { registerCtor } from './expression'

const sfcInitialized = new WeakSet<Element>()
// Cache to avoid refetching the same SFC source and to dedupe concurrent loads
const sfcLoadCache = new Map<string, Promise<void>>()

/**
 * Defines a component from an SFC element, executing scripts and registering as custom element.
 */
export function defineSfcFromElement(sfcEl: Element): void {
  const tag = sfcEl.getAttribute('name') || ''
  const ctorName = sfcEl.getAttribute('class') || tag.split('-').filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')
  if (!tag || !ctorName) return
  
  // Execute scripts with local registration helpers (no globals)
  const scripts = sfcEl.querySelectorAll('script')
  scripts.forEach(script => {
    if (script.textContent) {
      try {
        const scope = (ctor: any) => { try { registerCtor(ctorName, ctor) } catch {} }
        const defineAs = (name: string, ctor: any) => { try { registerCtor(name, ctor) } catch {} }
        eval(script.textContent)
      } catch (e) {
        console.warn('impetus: SFC script eval error', e)
      }
    }
  })
  if (customElements.get(tag)) return

  const tpl = sfcEl.querySelector('template')
  let tplContent = tpl ? tpl.content : null
  if (!tplContent) {
    const kids = Array.from(sfcEl.childNodes).filter(n => {
      if (n.nodeType !== 1) return true
      const t = (n as Element).tagName
      return t !== 'SCRIPT' && t !== 'STYLE' && t !== 'TEMPLATE'
    })
    const frag = document.createDocumentFragment()
    kids.forEach(n => frag.appendChild(n.cloneNode(true)))
    tplContent = frag
  }

  class SfcHost extends HTMLElement {
    connectedCallback() {
      if (!this.hasAttribute('use')) {
        try { this.setAttribute('use', ctorName) } catch {}
      }
      if (!sfcInitialized.has(this)) {
        sfcInitialized.add(this)
        if (!this.firstElementChild && tplContent) {
          try { this.appendChild(tplContent.cloneNode(true)) } catch {}
        }
      }
    }
  }

  customElements.define(tag, SfcHost)
}

/**
 * Loads SFC components from elements with src attribute and inline <component> tags.
 */
export async function loadSfcComponents(): Promise<void> {
  // Process external SFCs (with src)
  const sfcHosts = Array.from(document.querySelectorAll('[src]'))
  await Promise.all(sfcHosts.map(async host => {
    const src = host.getAttribute('src')
    if (src) {
      const abs = (() => {
        try { return new URL(src, (document.baseURI || location.href)).href } catch { return src }
      })()
      let p = sfcLoadCache.get(abs)
      if (!p) {
        p = (async () => {
          try {
            const response = await fetch(abs)
            const html = await response.text()
            const parser = new DOMParser()
            const doc = parser.parseFromString(html, 'text/html')
            const sfcNodes = Array.from(doc.querySelectorAll('component[name]'))
            sfcNodes.forEach(sfcEl => defineSfcFromElement(sfcEl))
          } catch (e) {
            // On failure, allow retry by clearing cache entry
            sfcLoadCache.delete(abs)
            console.warn('impetus: failed to load SFC', src, e)
          }
        })()
        sfcLoadCache.set(abs, p)
      }
      await p
    }
  }))

  // Process inline SFC components (without src)
  const inlineSfcNodes = Array.from(document.querySelectorAll('component[name]'))
  inlineSfcNodes.forEach(sfcEl => {
    defineSfcFromElement(sfcEl)
    // Remove the component definition from DOM after processing
    try { sfcEl.parentNode?.removeChild(sfcEl) } catch {}
  })
}
