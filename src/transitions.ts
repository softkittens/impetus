export function applyTransition(el: HTMLElement, spec: string, show: boolean): void {
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
      setTimeout(() => { el.style.transition = ''; }, dur); 
    });
  } else {
    el.style.opacity = '1';
    requestAnimationFrame(() => {
      el.style.opacity = '0';
      setTimeout(() => { 
        el.setAttribute('hidden',''); 
        el.setAttribute('aria-hidden','true'); 
        el.style.display = 'none'; 
        el.style.transition = ''; 
      }, dur);
    });
  }
}
