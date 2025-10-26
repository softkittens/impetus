/**
 * IMPETUS FRAMEWORK - Transitions
 * 
 * Applies enter/leave effects for elements controlled by `@show`.
 * Currently supports a simple `fade[:durationMs]` transition.
 * 
 * WHY THIS MODULE EXISTS:
 * - Gives a lightweight way to animate visibility changes without DOM churn
 * - Keeps timing and visibility concerns in one place
 * - Handles rapid toggles safely (e.g., open → close → open) using per‑element versioning
 *   so stale timeouts from older transitions can't override the latest state
 */
const transitionVersion = new WeakMap<HTMLElement, number>();

export function applyTransition(el: HTMLElement, spec: string, show: boolean): void {
  // Bump version to invalidate any pending timeouts from previous transitions
  const ver = (transitionVersion.get(el) || 0) + 1;
  transitionVersion.set(el, ver);
  const [type, durStr] = String(spec || 'fade').split(':');
  const dur = Math.max(0, Number(durStr || 150)) || 150;
  
  if (type !== 'fade') {
    if (show) {
      el.removeAttribute('hidden'); 
      el.removeAttribute('aria-hidden'); 
      el.style.removeProperty('display');
    } else {
      el.setAttribute('hidden',''); 
      el.setAttribute('aria-hidden','true'); 
      el.style.display = 'none';
    }
    return;
  }
  
  el.style.transition = `opacity ${dur}ms ease`;
  
  if (show) {
    el.removeAttribute('hidden'); 
    el.removeAttribute('aria-hidden'); 
    el.style.removeProperty('display');
    el.style.opacity = '0';
    requestAnimationFrame(() => { 
      el.style.opacity = '1'; 
      setTimeout(() => { 
        // Only finalize if this is still the latest transition
        if (transitionVersion.get(el) === ver) {
          el.style.transition = ''; 
          // Re-enforce visible state in case a stale timeout tried to hide it
          el.removeAttribute('hidden');
          el.removeAttribute('aria-hidden');
          el.style.removeProperty('display');
        }
      }, dur); 
    });
  } else {
    el.style.opacity = '1';
    requestAnimationFrame(() => {
      el.style.opacity = '0';
      setTimeout(() => { 
        // Only apply hidden state if this is still the latest transition
        if (transitionVersion.get(el) === ver) {
          el.setAttribute('hidden',''); 
          el.setAttribute('aria-hidden','true'); 
          el.style.display = 'none'; 
          el.style.transition = ''; 
        }
      }, dur);
    });
  }
}
