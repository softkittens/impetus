# sparkle
 
 To install dependencies:
 
 ```bash
 bun install
 ```
 
 To run (one-off):
 
 ```bash
 bun run index.ts
 ```
 
 For development with hot reload:
 
 ```bash
 bun run dev
 ```
 
 To start (no hot reload):
 
 ```bash
 bun run start
 ```
 
 To build (outputs to dist/):
 
 ```bash
 bun run build
 ```
 
 To run tests:
 
 ```bash
 bun test
 ```
 
 To type-check:
 
 ```bash
 bun run typecheck
 ```

 ## App playground (browser demo)
 
 Build the browser ESM bundle to `app/sparkle.js` and serve the `app/` folder locally:
 
 ```bash
 bun run build:browser
 bun run serve
 ```
 
 For watch-mode while iterating on `src/`:
 
 ```bash
 bun run build:watch
 # in another terminal
 bun run serve
 ```
 
 This project was created using `bun init` in bun v1.3.1. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
