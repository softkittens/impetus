# Impetus - your new JavaScript companion

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE) [![Runtime: Bun 1.3+](https://img.shields.io/badge/runtime-bun%201.3%2B-000)](https://bun.sh) [![TypeScript](https://img.shields.io/badge/language-TypeScript-3178c6)](#)


## One tag. Interactive UI.

A tiny HTML‑first micro‑runtime that turns static pages into interactive UI — straight from a CDN.

- Start in seconds. Drop a script, go interactive.
- HTML‑first. Author behavior where you render.
- Zero build. No VDOM. Works on static hosting.
- Tiny API. Directives, inline expressions, class components.


## Get started (CDN)

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/softkittens/impetus@main/app/impetus.js" defer init></script>

<div scope='{"count":0}'>
  <button onclick="count++">Clicked {count} times</button>
  <!-- No build step. Works on any static page. -->
</div>
```

## Table of Contents
- [Example](#example)
- [Key Benefits](#key-benefits)
- [Quick Syntax](#quick-syntax)
- [Why Impetus](#why-impetus)
- [Quick Start](#quick-start)
- [Components API (use + template)](#components-api-use--template)
- [FAQ](#faq)
- [Acknowledgements](#acknowledgements)
- [Contributing](#contributing)
- [License](#license)

## Example

```html
<div scope='{"count": 0, "name": "Jane", "open": true}'>
  Hello, {name}! Count is {count}.

  <!-- Simple expressions -->
  <button onclick="count++">+</button>
  <button onclick="count=Math.max(0,count-1)">-</button>

  <!-- Two-way binding -->
  <input :value="name" />

  <!-- Conditional display -->
  <div @show="open" @transition="fade:150">Showing when open is true</div>
  <button onclick="open=!open">Toggle</button>

  <!-- Lists -->
  <ul>
    <template @each="[1,2,3] as n,i">
      <li>Item {i}: {n}</li>
    </template>
  </ul>
</div>
```

### Inline Component Example

```html
<!-- Inline component uses its own content as the template -->
<div use="Counter">
  <p>Count: {count}</p>
  <button onclick="inc()">+</button>
  <button onclick="dec()">-</button>
  <button onclick="count = 0">reset</button>
</div>
<script>
  class Counter {
    count = 0
    inc() { this.count++ }
    dec() { this.count-- }
  }
</script>
```

## Component Example (Using template)

```html
<!-- Component host (the "component") -->
<div use="Counter" template="counter" max="5"></div>

<!-- Template (can be anywhere on the page) -->
<template id="counter">
  <div>Count: {count}</div>

  <!-- Events -->
  <button onclick="inc()">+</button>
  <button onclick="dec()">-</button>

  <div class="text-xs text-gray-500" >Max: {max}</div>
</template>

<!-- Class definition (can live anywhere; CDN auto‑init will find it) -->
<script>
  class Counter {
    static template = 'counter'
    constructor(props={}) {
      this.count = 0
      this.max = props.max ?? 10
    }
    inc() { if (this.count < this.max) this.count++ }
    dec() { if (this.count > 0) this.count-- }
    onMount() {}
    onDestroy() {}
  }
</script>
```

## Key Benefits
- ⚡️ Fast to adopt — One script tag; works on any static page.
- 🧠 Simple mental model — Plain objects for state; plain HTML for views.
- 🧩 Real components when you need them — Class‑based components with templates and lifecycle.
- 🎯 Precise bindings — `{expr}` in text/attrs; `@if/@show/@each` for structure; `$event` for robust events.
- 🧪 Confidence — Tested core; examples in `app/`.
- 🌐 CDN‑first — Import from a CDN; no bundler required.

## Quick Syntax

State (scoped root)
```html
<div scope='{"name":"Jane","count":0}'>Hello, {name} ({count})</div>
```

Text + attributes
```html
<h1 class="{count>10 ? 'big' : 'small'}">Hi, {name}</h1>
<div style="{{ color: count>0 ? 'green' : 'red' }}"></div>
```

Events and $event
```html
<input :value="name" />
<button onclick="count++">Clicked {count}</button>
<div 
  onclick="$event.outside && (open=false)" 
  onfocusout="$event.outside && (open=false)" 
  onkeydown="$event.escape.prevent.stop && (open=false)"></div>
```

Conditional display
```html
<div @if="ok">Shown when ok</div>
<div @else>Fallback</div>
<div @show="loading" @transition="fade:200">Loading…</div>
```

Lists
```html
<ul>
  <template @each="items as it,i">
    <li key="{it.id}">{i}. {it.label}</li>
  </template>
  <!-- each clone gets { it, i, $root } -->
  <!-- key preserves instances across reorders -->
</ul>
```

Two-way model (shorthand)
```html
<input :value="user.email" />
```

## Why Impetus
- Zero‑setup progressive enhancement for static sites.
- HTML you already write, just reactive.
- Class components without a framework tax: constructor props, lifecycle, template resolution.
- Microtask‑batched updates and per‑root caching keep it fast by default.

## When to use Impetus
- You want to progressively enhance static pages without a build step.
- You prefer HTML-first templates and inline expressions over heavy frameworks.
- You need small, interactive widgets (forms, tabs, lists, modals) fast.
- You value simple reactivity and minimal API surface.

## When not to use Impetus
- You need a full SPA router, SSR/SSG integration, or complex app state patterns out of the box.
- You require a large ecosystem of plugins/components and tight framework tooling.
- You’re building a large-scale SPA where a full framework provides clear advantages.

## Quick Start

### CDN (recommended)

Add a single script tag (auto-init):

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/softkittens/impetus@main/app/impetus.js" defer init></script>
```

Or import explicitly:

```html
<script type="module">
  import { init } from 'https://cdn.jsdelivr.net/gh/softkittens/impetus@main/app/impetus.js'
  init()
  // or scope-only: init('[scope]')
</script>
```

### Minimal Example

```html
<div scope='{"count": 0, "name": "Jane", "open": true}'>
  Hello, {name}! Count is {count}.

  <button onclick="count++">+</button>
  <button onclick="count=Math.max(0,count-1)">-</button>

  <input :value="name" />

  <div @show="open" @transition="fade:150">Showing when open is true</div>
  <button onclick="open=!open">Toggle</button>

  <ul>
    <template @each="[1,2,3] as n,i">
      <li>Item {i}: {n}</li>
    </template>
  </ul>
</div>
```

### One‑Minute Examples
- **Outside click + Escape + focus-out:** use `$event.outside` on `click` and `focusout`, and `$event.escape.prevent.stop` on `keydown`.
- **Two‑way input:** `:value="path"` (events wired automatically).
- **Conditional blocks:** `@if` / `@else` for DOM add/remove; `@show` for toggling visibility.
- **Computed bits:** rely on expression caching within a render pass.


## Core Concepts

State mounting (scoped root)
```html
<div scope='{"name":"Jane"}'>
  Hello, {name}
</div>
```

Text interpolation
- Inline expressions render results in text and attributes.
- Escape braces with double braces: `{{` and `}}`.

Attribute bindings (selected cases)
- `class="{ condition ? 'a' : 'b' }"` supports inline expressions within braces.
- `style="{ { color: ok ? 'green' : 'red' } }"` supports object-to-inline css.
- `value/checked/disabled` are boolean-aware; `:value` is two-way shorthand.

Event modifiers
- Use on any `on*` attribute via dot modifiers:
  - `.prevent` → `onclick.prevent="submit()"`
  - `.stop` → `onclick.stop="inner()"`
  - `.once` → `onclick.once="helloOnce()"`
  - Modifiers can be combined, e.g. `onclick.prevent.stop="..."`

Events
- Inline: `onclick="count++"`, `oninput="name=$event.target.value"`.
- `$event` helpers:
  - `$event.outside` for boundary checks on the element the handler is bound to.
    - Works for `click` and focus transitions. For `focusout`, it uses `relatedTarget` and treats `null` as outside.
  - Key alias helpers: `$event.escape`, `$event.enter`, `$event.space`, `$event.tab`, `$event.backspace`.
    - Chain `.prevent.stop` and use with `&&` in expressions, e.g. `$event.escape.prevent.stop && close()`.
- `keydown` listeners are attached on `document` for consistent keyboard behavior; outside listeners also use `document` when needed.

Directives
- `@if="expr"` / `@else` – conditional insert/remove (paired siblings).
- `@show="expr"` – toggles visibility via `hidden`/`style.display` without DOM churn.
- `@each="list as item,i"` – clones a template element for each item.
  - Each clone gets an extended scope: `{ itemKey, idxKey, $root }`.
  - Optional keyed mode: add `key="<expr>"` on the holder element to preserve instances.
    - Example: `<li @each="items as it,i" key="it.id">`.

Transitions
- Apply to `@show` blocks via `@transition` (currently `fade[:durationMs]`).
  - Example: `<div @show="open" @transition="fade:200">...</div>`.
  - Concurrency-safe: rapid toggles won’t leave elements hidden incorrectly; transitions are versioned per element.

Two-way model (shorthand)
- `:value="path"` marks element as model-bound; runtime wires appropriate events and assigns back into scope.

## Components API (use + template)

Attach a class and optionally a template id. Three template patterns are supported:



### 1. Inline Templates
Use the element's own content as the template - no separate template needed:

```html
<div use="Counter" class="p-4 border rounded">
  <h3>Inline Counter</h3>
  <div>Count: {count}</div>
  <button onclick="inc()">+</button>
  <button onclick="dec()">-</button>
</div>

<script>
  class Counter {
    count = 0
    inc() { this.count++ }
    dec() { this.count-- }
  }
</script>
```

### 2. Template ID as Prop
Pass template ID via prop for reusable components:

```html
<template id="card">
  <div class="card">{title}</div>
</template>

<div use="Card" template="card" title="Hello"></div>

<script>
  class Card {
    // No static template needed - receives via prop
    constructor(props) {
      this.title = props.title
    }
  }
</script>
```

### 3. Traditional Template Reference
Original pattern with static template or template attribute:

```html
<template id="counter">
  <div>Count: {count}</div>
  <button onclick="inc()">+</button>
  <button onclick="dec()">-</button>
</template>

<div use="Counter" template="counter" max="5"></div>

<script>
  class Counter {
    static template = 'counter'  // Optional - template attribute takes precedence
    constructor(props={}) {
      this.count = 0
      this.max = props.max ?? 10
    }
    inc() { if (this.count < this.max) this.count++ }
    dec() { if (this.count > 0) this.count-- }
  }
</script>
```

### Template Resolution Priority
Templates resolve in order:
1. Host `template` attribute (highest priority)
2. Inline content (host element content)
3. Template ID from props (`template="id"` prop)
4. Static `Class.template` property
5. Instance `this.template` property (lowest priority)

### Props and Attributes
- Props come from `props='{...}'` JSON plus any other attributes (coerced to booleans/numbers when possible)
- `data-*` and `aria-*` attributes keep their original names (e.g., `data-test` → `data-test`)
- Other attributes are converted to camelCase (e.g., `max-items` → `maxItems`)
- If `inherit` attribute is present, the component uses the nearest parent scope instance instead of constructing a new one



## Reactivity model

- Every mounted root (and component host) is wrapped by a Proxy via `makeReactive`.
- Any property writes schedule a microtask render of that root.
- Nested objects are wrapped lazily (on access).
- Multiple roots bound to the same proxy are tracked and re-rendered.
- When a reactive proxy is accessed from another root (e.g., `$root` inside `@each` clones), that root is registered as a dependent and will re-render on changes to the shared proxy.

Computed caching
- Expression results are cached per-root within a render pass.
- Cache is invalidated automatically before each scheduled render.

Global store
- A shared reactive object exposed as `$store` in every scope and component instance.
- Read/write from templates `{ $store.count }` or methods `this.$store.count++`.
- Useful for cross-component state without a framework-level store.

## Architecture (runtime.ts)

- Expression compile/eval with caching and `with(state)` scoping.
- DOM helpers: boolean props, class/style normalization.
- Directive handlers: `@if/@else`, `@show`, `@each` with ordered insertion.
- Binding collection: attribute and text interpolation per-root.
- Event wiring: inline `on*` converted to listeners; `$event` proxy; outside-click helper.
- Components: `use`, props parsing, template resolution, lifecycle hooks (`onMount`, `onDestroy`).

## Performance notes

- Renders are microtask-batched per root (WeakSet guard).
- `@each` respects array identity; preserves order via moving anchor.
- Prefer `@show` for transient states (loading) to avoid DOM churn.
- Use computed-like getters for filtered views; Impetus caches expr results per render.
- Production build strips dev-only heuristics (e.g., heavy ctor resolution) via minification.

## Build scripts

```bash
# Server-side build (Bun target)
bun run build

# Browser bundle (minified ESM)
bun run build:browser

# Watch bundle
bun run build:watch

# Local server for app/
bun run serve
```

## Examples (open after build)

- `/counter.html` – basic component API, props.
- `/inline-components.html` – inline templates, template props, reusable components.
- `/list.html` – search + filter, `@if/@else`, `@each`.
- `/tabs.html` – accessible tabs: keyboard (arrow/home/end), `@each`, ARIA.
- `/todo.html` – add/toggle/delete, filters, computed counts.
- `/fetch.html` – async fetch, loading/error/show/empty.
- `/modal.html` – outside/Escape close.
- `/tooltip.html` – Tippy/Popper integration.
- `/select2.html` – Select2 single/multi integration.
 - `/store.html` – Global `$store`, event modifiers, `.once`.

## FAQ

- How to initialize automatically?
  Use `<script type="module" src="./impetus.js" defer init></script>`.

- When to use `@show` vs `@if`?
  `@show` toggles visibility without DOM changes; `@if` mounts/unmounts.

- How does `$event.outside` work?
  The `$event` proxy exposes `outside` which is `true` if the click target is outside the bound element.

---

This project was created with Bun v1.3+. See `app/` for examples and `src/runtime.ts` for the core runtime.

## Acknowledgements

Impetus draws inspiration from the simplicity and ergonomics of projects like petite-vue and Alpine.

## Contributing

Issues are welcome. At this time, pull requests are not being encouraged while the API stabilizes.

If you want to run the project locally for experimentation:

```bash
bun install

# Build browser bundle and serve examples
bun run build:browser
bun run serve

# Dev (Bun server + hot) for Node-side index.ts
bun run dev

# Watch mode with optional devtools
bun run build:watch
# or enable devtools
bun run build:watch --devtools
# or via env var
WATCH_DEVTOOLS=1 bun run build:watch

# Type-check
bun run typecheck
```

Devtools are conditionally loaded at build-time and are not included unless enabled.

## License

MIT License. See LICENSE file.
