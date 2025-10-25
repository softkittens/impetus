// Simple, reliable devtools that actually work
import { stateManager } from './state';
import { renderBindings } from './render';

class SimpleDevtools {
  private panel: HTMLDivElement | null = null;
  private textarea: HTMLTextAreaElement | null = null;
  private isOpen = false;
  private currentRoot: Element | null = null;
  private monitorInterval: number | null = null;

  constructor() {
    this.createPanel();
    this.setupKeyboardShortcut();
  }

  private createPanel() {
    // Create panel
    this.panel = document.createElement('div');
    this.panel.style.cssText = `
      position: fixed;
      top: 50px;
      right: 20px;
      width: 350px;
      height: 450px;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      color: #fff;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 12px;
      z-index: 999999;
      display: none;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    `;

    // Create header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #2a2a2a;
      border-bottom: 1px solid #333;
      border-radius: 8px 8px 0 0;
    `;
    
    const title = document.createElement('div');
    title.textContent = 'Impetus Devtools';
    title.style.fontWeight = 'bold';
    title.style.color = '#3b82f6';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #fff;
      font-size: 20px;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    closeBtn.onmouseover = () => closeBtn.style.background = '#444';
    closeBtn.onmouseout = () => closeBtn.style.background = 'none';
    closeBtn.onclick = () => this.hide();

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Create content area
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 16px;
      height: calc(100% - 60px);
      display: flex;
      flex-direction: column;
    `;

    // Component selector
    const selector = document.createElement('div');
    selector.style.cssText = `
      margin-bottom: 12px;
    `;
    
    const selectorLabel = document.createElement('div');
    selectorLabel.textContent = 'Component:';
    selectorLabel.style.cssText = `
      font-size: 11px;
      color: #888;
      margin-bottom: 4px;
    `;

    const componentSelect = document.createElement('select');
    componentSelect.style.cssText = `
      width: 100%;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 4px;
      color: #fff;
      padding: 6px 8px;
      font-size: 11px;
    `;
    componentSelect.onchange = () => this.selectComponent(componentSelect.value);

    selector.appendChild(selectorLabel);
    selector.appendChild(componentSelect);

    // State editor
    const stateLabel = document.createElement('div');
    stateLabel.textContent = 'State (Real-time):';
    stateLabel.style.cssText = `
      font-size: 11px;
      color: #888;
      margin-bottom: 4px;
    `;

    this.textarea = document.createElement('textarea');
    this.textarea.style.cssText = `
      flex: 1;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 4px;
      color: #fff;
      font-family: monospace;
      font-size: 11px;
      padding: 8px;
      resize: none;
    `;
    this.textarea.placeholder = 'Select a component to edit its state...';

    // Setup real-time editing with simple debounce
    let editTimeout: number | null = null;
    this.textarea.addEventListener('input', () => {
      if (editTimeout) clearTimeout(editTimeout);
      editTimeout = setTimeout(() => this.updateState(), 100) as unknown as number;
    });

    // Also try keyup as backup
    this.textarea.addEventListener('keyup', () => {
      if (editTimeout) clearTimeout(editTimeout);
      editTimeout = setTimeout(() => this.updateState(), 100) as unknown as number;
    });

    content.appendChild(selector);
    content.appendChild(stateLabel);
    content.appendChild(this.textarea);

    // Store reference to select for later
    (this as any).componentSelect = componentSelect;

    // Assemble panel
    this.panel.appendChild(header);
    this.panel.appendChild(content);

    // Add to page
    document.body.appendChild(this.panel);
  }

  private setupKeyboardShortcut() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  private toggle() {
    if (this.isOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  private show() {
    if (!this.panel) return;
    this.isOpen = true;
    this.panel.style.display = 'block';
    this.refreshComponents();
    this.startStateMonitoring();
  }

  private hide() {
    if (!this.panel) return;
    this.isOpen = false;
    this.panel.style.display = 'none';
    this.stopStateMonitoring();
  }

  private startStateMonitoring() {
    // Monitor state changes every 500ms
    this.monitorInterval = setInterval(() => {
      if (this.currentRoot && this.textarea && !this.textarea.matches(':focus')) {
        // Only update if textarea is not being edited
        this.loadState();
      }
    }, 500) as unknown as number;
  }

  private stopStateMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  private refreshComponents() {
    const roots = stateManager.getAllRoots();
    const select = (this as any).componentSelect as HTMLSelectElement;
    
    if (!select) return;

    // Clear existing options
    select.innerHTML = '';

    if (roots.length === 0) {
      const option = document.createElement('option');
      option.textContent = 'No components found';
      select.appendChild(option);
      return;
    }

    // Add component options
    roots.forEach((root, index) => {
      const option = document.createElement('option');
      option.value = index.toString();
      
      const useAttr = root.getAttribute('use');
      const id = root.id;
      const className = root.className;
      
      if (useAttr) {
        option.textContent = useAttr;
      } else if (id) {
        option.textContent = `#${id}`;
      } else if (className) {
        option.textContent = `.${className.split(' ')[0]}`;
      } else {
        option.textContent = root.tagName.toLowerCase();
      }
      
      select.appendChild(option);
    });

    // Select first component by default
    if (roots.length > 0) {
      this.selectComponent('0');
    }
  }

  private selectComponent(indexStr: string) {
    const roots = stateManager.getAllRoots();
    const index = parseInt(indexStr);
    
    if (index >= 0 && index < roots.length) {
      this.currentRoot = roots[index] || null;
      this.loadState();
      
      // Restart monitoring for new component
      if (this.isOpen) {
        this.stopStateMonitoring();
        this.startStateMonitoring();
      }
    }
  }

  private loadState() {
    if (!this.currentRoot || !this.textarea) return;
    
    const state = stateManager.getRootState(this.currentRoot);
    
    if (state) {
      try {
        const stateJson = JSON.stringify(state, null, 2);
        this.textarea.value = stateJson;
      } catch (e) {
        this.textarea.value = 'Error serializing state';
      }
    } else {
      this.textarea.value = 'No state found';
    }
  }

  private updateState() {
    if (!this.currentRoot || !this.textarea) return;
    
    try {
      const newState = JSON.parse(this.textarea.value);
      const liveState = stateManager.getRootState(this.currentRoot);
      
      if (liveState) {
        // Clear existing properties
        Object.keys(liveState).forEach(key => {
          delete liveState[key];
        });
        
        // Set new properties
        Object.keys(newState).forEach(key => {
          liveState[key] = newState[key];
        });
        
        // Trigger re-render
        renderBindings(liveState, this.currentRoot);
      }
    } catch (e) {
      // Invalid JSON, ignore while typing
    }
  }
}

// Initialize devtools when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new SimpleDevtools();
      console.log('[SimpleDevtools] Ready - Press Ctrl+Shift+D');
    });
  } else {
    new SimpleDevtools();
    console.log('[SimpleDevtools] Ready - Press Ctrl+Shift+D');
  }
}
