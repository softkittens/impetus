# Impetus

Tiny template-and-attributes runtime for building interactive UI without a build step in HTML. Inspired by petite-vue and Alpine. Ships as an ESM bundle for the browser.

Highlights
- Minimal API: attribute directives, text interpolation, simple components.
- Reactive state via Proxies, scheduled microtask re-renders.
- Works directly in static HTML; no VDOM.
- Examples included under `app/` (tabs, list, todo, fetch, modal, select2, tooltip).

## Install / Dev

```bash
bun install

# Dev (Bun server + hot) for Node-side index.ts
bun run dev

# One-off start
bun run start

# Type-check
bun run typecheck
```

## Browser bundle (playground)

Build the browser ESM to `app/impetus.js` and serve `app/`:

```bash
bun run build:browser   # minified ESM -> app/impetus.js
bun run serve           # local static server
```

Watch-mode while editing `src/`:

```bash
bun run build:watch
# in another terminal
bun run serve
```

### Devtools (optional)

Enable the in-page devtools chip during watch builds:

```bash
bun run build:watch --devtools
# in another terminal
bun run serve
```

Alternatively with an env var:

```bash
WATCH_DEVTOOLS=1 bun run build:watch
```

Devtools are conditionally loaded at build-time and are not included unless enabled.

Auto-init (one liner):
```html
<script type="module" src="./impetus.js" defer init></script>
```

Or explicit init:
```html
<script type="module">
  import { init } from './impetus.js'
  init()
  // or scope-only: init('[scope]')
</script>
```

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
