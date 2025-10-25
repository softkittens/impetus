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

// Auto-load devtools in local environments so a minimal panel shows everywhere
if (typeof location !== 'undefined') {
  const host = location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  if (isLocal) {
    // Best-effort optional import; ignore if not present
    import('./devtools').catch(() => {});
  }
}
