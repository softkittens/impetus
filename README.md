# Impetus

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE) [![Runtime: Bun 1.3+](https://img.shields.io/badge/runtime-bun%201.3%2B-000)](https://bun.sh) [![TypeScript](https://img.shields.io/badge/language-TypeScript-3178c6)](#)

_HTML-first reactivity. Zero build step._

Build reactive UI in plain HTML — no bundler required. Impetus is a tiny template-and-attributes runtime designed for speed and clarity. Ship a single ESM file and progressively enhance any page.

## Get started (CDN)

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/softkittens/impetus@main/app/impetus.js" defer init></script>

<div scope='{"count":0}'>
  <button onclick="count++">Clicked {count} times</button>
  <!-- No build step. Works on any static page. -->
  <!-- Pin to a release tag (e.g. @v0.1.0) when available. -->
  <!-- Prefer placing the script in <head> with defer. -->
</div>
```

## Table of Contents
- [Example](#example)
- [Component Example](#component-example)
- [Key Benefits](#key-benefits)
- [Quick Syntax](#quick-syntax)
- [Why Impetus](#why-impetus)
- [When to use Impetus](#when-to-use-impetus)
- [When not to use Impetus](#when-not-to-use-impetus)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Components API (use + template)](#components-api-use--template)
- [Reactivity model](#reactivity-model)
- [Architecture (runtime.ts)](#architecture-runtimets)
- [Performance notes](#performance-notes)
- [Build scripts](#build-scripts)
- [Examples (open after build)](#examples-open-after-build)
- [FAQ](#faq)
- [Acknowledgements](#acknowledgements)
- [Contributing](#contributing)
- [License](#license)

## Example

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

## Component Example

```html
<!-- Component host (the "component") -->
<div use="Counter" template="counter" max="5"></div>

<!-- Template (can be anywhere on the page) -->
<template id="counter">
  <div>Count: {count}</div>
  <button onclick="inc()">+</button>
  <button onclick="dec()">-</button>
  <div class="text-xs text-gray-500">Max: {max}</div>
</template>

<!-- Class definition (can live anywhere; CDN auto‑init will find it) -->
<script type="module">
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
- ⚡ **Minimal API**: directives, `{expr}` interpolation, simple components.
- 🔁 **Reactive by default**: Proxy state, microtask-batched renders.
- 🧩 **Drop-in**: static HTML, no VDOM, no compile step.
- 🛠️ **Practical DX**: `$event`, outside-click, keyboard helpers.
- 🧪 **Confidence**: tested core, examples in `app/`.
- 🌐 **CDN-first**: load from a CDN and start immediately.

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
<button onclick="(count++)">Clicked {count}</button>
<div onclick="open=false" onkeydown="($event.key==='Escape') && (open=false)"></div>
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

## Why Impetus?
- **Zero-setup progressive enhancement.** Start with a static page and sprinkle behavior.
- **Understandable mental model.** State is plain objects; templates are plain HTML.
- **Fast enough by design.** Microtask-batched updates and per-root computed caching.
- **Just enough components.** Opt-in class-based components with templates and lifecycle hooks.

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

Note: Replace `@main` with a tagged release for stability when you publish one (e.g., `@v0.1.0`).

### Local build

1) Build the browser ESM bundle and serve the examples directory:

```bash
bun run build:browser   # emits app/impetus.js
bun run serve           # serves ./app
```

2) In your HTML, include the generated bundle and auto-init:

```html
<script type="module" src="./impetus.js" defer init></script>
```

Or import and call `init()` manually:

```html
<script type="module">
  import { init } from './impetus.js'
  init()
  // or scope-only: init('[scope]')
  // or enable devtools in watch builds
</script>
```

If this helps you ship faster, consider starring the repo.

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
- **Outside click + Escape:** use `$event.outside` and `$event.key==='Escape'` in inline handlers.
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
- `{expr}` inside text nodes or attribute values renders expression results.
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
- `$event` is a safe proxy (methods bound), plus `$event.outside` boolean for outside-click use.
- `keydown` listeners are attached on `document` for consistent keyboard behavior; `$event.outside` also uses `document`.

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

Two-way model (shorthand)
- `:value="path"` marks element as model-bound; runtime wires appropriate events and assigns back into scope.

## Components API (use + template)

Attach a class and optionally a template id.

```html
<template id="counter">
  <div>Count: {count}</div>
  <button onclick="inc()">+</button>
  <button onclick="dec()">-</button>
  <div class="text-xs text-gray-500">Max: {max}</div>
 </template>

<div use="Counter" template="counter" max="5"></div>

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

Notes
- Props come from `props='{...}'` JSON plus any other attributes (coerced to booleans/numbers when possible).
- If `inherit` attribute is present, the component uses the nearest parent scope instance instead of constructing a new one.
- Templates resolve in order: host `template` attr → `Class.template` → `instance.template`.

### Template anchors

Mount a `<template>` by placing a `template="id"` attribute on an element:

```html
<template id="card">
  <div class="card">{title}</div>
</template>

<section template="card"></section>
```

At mount time, Impetus replaces the element’s contents with the cloned template and removes the `template` attribute to avoid re-processing.

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
