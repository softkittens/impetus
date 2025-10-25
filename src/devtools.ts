/**
 * IMPETUS FRAMEWORK - Developer Tools Module
 * 
 * This module provides a simple, reliable devtools panel for debugging components.
 * It allows developers to inspect and edit component state in real-time.
 * 
 * WHY THIS MODULE EXISTS:
 * - Provides real-time state inspection and editing
 * - Helps debug component behavior and data flow
 * - Shows all active components in the application
 * - Enables bidirectional state synchronization for testing
 */

import { stateManager } from './state';
import { renderBindings } from './render';

/**
 * SIMPLE DEVTOOLS CLASS
 * 
 * This class creates and manages the devtools panel interface
 * It provides a clean, minimal debugging experience
 */
class SimpleDevtools {
  private panel: HTMLDivElement | null = null;     // The main devtools panel
  private textarea: HTMLTextAreaElement | null = null; // State editor textarea
  private isOpen = false;                          // Whether the panel is visible
  private currentRoot: Element | null = null;      // Currently selected component
  private monitorInterval: number | null = null;   // Interval for monitoring state changes

  /**
   * CONSTRUCTOR - Initialize the devtools
   * 
   * WHY: Sets up the UI and keyboard shortcuts when devtools are loaded
   */
  constructor() {
    this.createPanel();
    this.setupKeyboardShortcut();
  }

  /**
   * CREATE THE DEVTOOLS PANEL UI
   * 
   * WHY: Builds the visual interface that developers interact with
   * The panel includes component selection, state viewing, and editing
   */
  private createPanel() {
    // Create the main panel container
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

    /**
     * CREATE THE HEADER SECTION
     * 
     * The header contains the title and close button
     */
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
    
    // Panel title
    const title = document.createElement('div');
    title.textContent = 'Impetus Devtools';
    title.style.fontWeight = 'bold';
    title.style.color = '#3b82f6';

    /**
     * CREATE THE CLOSE BUTTON
     * 
     * Allows users to close the devtools panel
     */
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
    
    // Add hover effects for better UX
    closeBtn.onmouseover = () => closeBtn.style.background = '#444';
    closeBtn.onmouseout = () => closeBtn.style.background = 'none';
    closeBtn.onclick = () => this.hide(); // Close the panel when clicked

    header.appendChild(title);
    header.appendChild(closeBtn);

    /**
     * CREATE THE MAIN CONTENT AREA
     * 
     * This contains the component selector and state editor
     */
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 16px;
      height: calc(100% - 60px);
      display: flex;
      flex-direction: column;
    `;

    /**
     * CREATE THE COMPONENT SELECTOR
     * 
     * Allows users to choose which component to inspect/edit
     */
    const selector = document.createElement('div');
    selector.style.cssText = `
      margin-bottom: 12px;
    `;
    
    // Label for the component selector
    const selectorLabel = document.createElement('div');
    selectorLabel.textContent = 'Component:';
    selectorLabel.style.cssText = `
      font-size: 11px;
      color: #888;
      margin-bottom: 4px;
    `;

    // Dropdown to select components
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

    /**
     * CREATE THE STATE EDITOR
     * 
     * This is where users can view and edit component state in real-time
     */
    const stateLabel = document.createElement('div');
    stateLabel.textContent = 'State (Real-time):';
    stateLabel.style.cssText = `
      font-size: 11px;
      color: #888;
      margin-bottom: 4px;
    `;

    // Textarea for editing JSON state
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

    /**
     * SETUP REAL-TIME STATE EDITING
     * 
     * This enables bidirectional synchronization:
     * - When user edits state in devtools → component updates
     * - When component state changes → devtools updates
     * 
     * WHY: We use debouncing to avoid excessive re-renders while typing
     */
    let editTimeout: number | null = null;
    
    // Listen for input events (typing, paste, etc.)
    this.textarea.addEventListener('input', () => {
      if (editTimeout) clearTimeout(editTimeout);
      editTimeout = setTimeout(() => this.updateState(), 100) as unknown as number;
    });

    // Also listen for keyup as backup (catches some edge cases)
    this.textarea.addEventListener('keyup', () => {
      if (editTimeout) clearTimeout(editTimeout);
      editTimeout = setTimeout(() => this.updateState(), 100) as unknown as number;
    });

    content.appendChild(selector);
    content.appendChild(stateLabel);
    content.appendChild(this.textarea);

    // Store reference to select for later access
    (this as any).componentSelect = componentSelect;

    // Assemble the complete panel
    this.panel.appendChild(header);
    this.panel.appendChild(content);

    // Add the completed panel to the page
    document.body.appendChild(this.panel);
  }

  /**
   * SETUP KEYBOARD SHORTCUT
   * 
   * WHY: Provides quick access to devtools without UI interaction
   * Ctrl+Shift+D is a common devtools shortcut pattern
   */
  private setupKeyboardShortcut() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault(); // Prevent browser default behavior
        this.toggle(); // Show/hide the devtools panel
      }
    });
  }

  /**
   * TOGGLE PANEL VISIBILITY
   * 
   * WHY: Simple helper to switch between show/hide states
   */
  private toggle() {
    if (this.isOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * SHOW THE DEVTOOLS PANEL
   * 
   * WHY: Makes the panel visible and starts monitoring
   */
  private show() {
    if (!this.panel) return;
    this.isOpen = true;
    this.panel.style.display = 'block';
    this.refreshComponents(); // Load available components
    this.startStateMonitoring(); // Start watching for state changes
  }

  /**
   * HIDE THE DEVTOOLS PANEL
   * 
   * WHY: Hides the panel and stops monitoring to save resources
   */
  private hide() {
    if (!this.panel) return;
    this.isOpen = false;
    this.panel.style.display = 'none';
    this.stopStateMonitoring(); // Stop watching for state changes
  }

  /**
   * START STATE MONITORING
   * 
   * WHY: Enables bidirectional synchronization
   * When component state changes from user interaction, the devtools update
   */
  private startStateMonitoring() {
    // Monitor state changes every 500ms
    // WHY: Frequent enough to feel real-time, but not so frequent it hurts performance
    this.monitorInterval = setInterval(() => {
      if (this.currentRoot && this.textarea && !this.textarea.matches(':focus')) {
        // Only update if the textarea is not being edited
        // WHY: Prevents overwriting user input while they're typing
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
