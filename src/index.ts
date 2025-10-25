declare const DEVTOOLS: boolean;
export * from "./runtime";

// Auto-init support: <script type="module" src="./sparkle.js" defer init></script>
if (typeof document !== 'undefined') {
  const script = document.querySelector('script[type="module"][init]');
  if (script) {
    queueMicrotask(async () => {
      const { init } = await import('./runtime');
      init();
    });
  }
}

if (typeof DEVTOOLS !== 'undefined' && DEVTOOLS) {
  import('./devtools').catch(() => {});
}
