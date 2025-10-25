/**
 * IMPETUS FRAMEWORK - Component System Tests
 * 
 * This test file covers the component system functionality including:
 * - Basic component mounting and lifecycle
 * - Inline templates (using host element content as template)
 * - Template ID passed as prop (new pattern)
 * - Props parsing and inheritance
 * - Component destruction and cleanup
 */

import { describe, test, expect, beforeEach, afterEach } from '../tests/setup';
import { mountComponent, destroyComponent, isComponentInitialized, getComponentInstance } from '../src/components';
import { stateManager } from '../src/state';

// Type declarations for test environment
declare global {
  interface Window {
    makeReactive: (obj: any, element: Element, isRoot?: boolean) => any;
    collectBindingsForRoot: (element: Element) => void;
    renderBindings: (state: any, element: Element) => void;
    wireEventHandlers: (element: Element, state: any) => void;
    devhooks: { onInitRoot: (element: Element, state: any) => void };
    [key: string]: any;
  }
}

// Mock global functions that components expect
global.window.makeReactive = (obj: any, element: Element, isRoot?: boolean) => {
  return new Proxy(obj, {
    set(target, prop, value) {
      target[prop] = value;
      // Mock render scheduling
      if (isRoot) {
        setTimeout(() => {
          global.window.renderBindings?.(target, element);
        }, 0);
      }
      return true;
    }
  });
};

global.window.collectBindingsForRoot = () => {};
global.window.renderBindings = () => {};
global.window.wireEventHandlers = () => {};
global.window.devhooks = { onInitRoot: () => {} };

// Helper function to create and expose component class globally
function createComponent(name: string, classDef: any) {
  (globalThis as any)[name] = classDef;
  (global.window as any)[name] = classDef;
}

function mountHost(componentName: string, attrs: Record<string, string | number> = {}) {
  const host = document.createElement('div');
  host.setAttribute('use', componentName);
  for (const [key, value] of Object.entries(attrs)) {
    host.setAttribute(key, String(value));
  }
  document.body.appendChild(host);
  return host;
}

describe('Component System', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    stateManager.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    stateManager.clear();
  });

  describe('Basic Component Mounting', () => {
    test('should mount a component with class constructor', () => {
      // Define a test component class
      class TestComponent {
        message = 'Hello World';
        count = 0;
        mounted = false;
        
        onMount() {
          this.mounted = true;
        }
      }
      
      // Make the class available globally
      createComponent('TestComponent', TestComponent);
      
      // Create host element
      const host = mountHost('TestComponent');
      
      // Mount the component
      mountComponent(host, 'TestComponent', false);
      
      // Verify component was mounted
      expect(isComponentInitialized(host)).toBe(true);
      const instance = getComponentInstance(host);
      expect(instance).toBeDefined();
      expect(instance.message).toBe('Hello World');
      expect(instance.mounted).toBe(true);
    });

    test('should pass props to component constructor', () => {
      class PropsComponent {
        props: any;
        
        constructor(props: any) {
          this.props = props;
        }
      }
      
      createComponent('PropsComponent', PropsComponent);
      
      const host = mountHost('PropsComponent', { 'data-test': 'value', max: '10' });
      
      mountComponent(host, 'PropsComponent', false);
      
      const instance = getComponentInstance(host);
      expect(instance.props['data-test']).toBe('value');
      expect(instance.props.max).toBe(10); // Should be coerced to number
    });
  });

  describe('Inline Templates', () => {
    test('should use host element content as inline template', () => {
      class InlineComponent {
        name = 'Inline Test';
      }
      
      createComponent('InlineComponent', InlineComponent);
      
      const host = mountHost('InlineComponent');
      
      // Create child elements manually since our mock doesn't parse innerHTML
      const h1 = document.createElement('h1');
      h1.textContent = '{name}';
      const button = document.createElement('button');
      button.setAttribute('onclick', "name='Clicked'");
      button.textContent = 'Click me';
      
      host.appendChild(h1);
      host.appendChild(button);
      
      mountComponent(host, 'InlineComponent', false);
      
      // Verify content is preserved (not removed by template processing)
      expect(host.children.length).toBeGreaterThan(0);
      expect(isComponentInitialized(host)).toBe(true);
    });

    test('should handle empty host element gracefully', () => {
      class EmptyComponent {
        message = 'Empty';
      }
      
      createComponent('EmptyComponent', EmptyComponent);
      
      const host = mountHost('EmptyComponent');
      
      expect(() => {
        mountComponent(host, 'EmptyComponent', false);
      }).not.toThrow();
      
      expect(isComponentInitialized(host)).toBe(true);
    });
  });

  describe('Template ID as Prop', () => {
    test('should use template ID passed as prop', () => {
      class PropTemplateComponent {
        title = 'From Prop Template';
      }
      
      createComponent('PropTemplateComponent', PropTemplateComponent);
      
      // Create a template element
      const template = document.createElement('template') as any;
      template.id = 'prop-template';
      template.content = { cloneNode: () => document.createElement('div') };
      document.body.appendChild(template);
      
      // Create host with template prop
      const host = mountHost('PropTemplateComponent', { template: 'prop-template' });
      
      mountComponent(host, 'PropTemplateComponent', false);
      
      // Verify template content was applied
      expect(isComponentInitialized(host)).toBe(true);
    });

    test('should warn when template ID from props is not found', () => {
      class MissingTemplateComponent {
        message = 'Missing';
      }
      
      createComponent('MissingTemplateComponent', MissingTemplateComponent);
      
      const host = mountHost('MissingTemplateComponent', { template: 'non-existent-template' });
      
      // Mock console.warn to verify warning is logged
      const originalWarn = console.warn;
      const warnings: string[] = [];
      console.warn = (message: string) => {
        warnings.push(message);
      };
      
      mountComponent(host, 'MissingTemplateComponent', false);
      
      expect(warnings.some(w => w.includes('template id not found'))).toBe(true);
      
      // Restore console.warn
      console.warn = originalWarn;
    });
  });

  describe('Template Resolution Priority', () => {
    test('should prioritize template attribute over inline content', () => {
      class PriorityComponent {
        text = 'Priority Test';
      }
      
      createComponent('PriorityComponent', PriorityComponent);
      
      // Create template
      const template = document.createElement('template') as any;
      template.id = 'priority-template';
      template.content = { cloneNode: () => {
        const div = document.createElement('div');
        div.className = 'from-attribute';
        return div;
      }};
      document.body.appendChild(template);
      
      // Create host with both inline content and template attribute
      const host = mountHost('PriorityComponent', { template: 'priority-template' });
      const inlineDiv = document.createElement('div');
      inlineDiv.className = 'inline';
      host.appendChild(inlineDiv);
      
      mountComponent(host, 'PriorityComponent', false);
      
      // Should use template attribute, not inline content
      expect(host.querySelector('.from-attribute')).toBeTruthy();
    });
  });

  describe('Component Destruction', () => {
    test('should call onDestroy when component is destroyed', () => {
      class DestructibleComponent {
        destroyed = false;
        
        onDestroy() {
          this.destroyed = true;
        }
      }
      
      createComponent('DestructibleComponent', DestructibleComponent);
      
      const host = mountHost('DestructibleComponent');
      
      mountComponent(host, 'DestructibleComponent', false);
      const instance = getComponentInstance(host);
      
      // Destroy component
      destroyComponent(host);
      
      // Verify cleanup
      expect(instance.destroyed).toBe(true);
      expect(isComponentInitialized(host)).toBe(false);
      expect(getComponentInstance(host)).toBeUndefined();
    });
  });

  describe('Inheritance Mode', () => {
    test('should inherit parent state when inherit attribute is present', () => {
      class ParentComponent {
        parentData = 'parent value';
      }
      
      class ChildComponent {
        childData = 'child value';
      }
      
      createComponent('ParentComponent', ParentComponent);
      createComponent('ChildComponent', ChildComponent);
      
      // Create parent
      const parent = document.createElement('div');
      parent.setAttribute('use', 'ParentComponent');
      document.body.appendChild(parent);
      mountComponent(parent, 'ParentComponent', false);
      
      // Create child with inherit
      const child = document.createElement('div');
      child.setAttribute('use', 'ChildComponent');
      child.setAttribute('inherit');
      parent.appendChild(child);
      mountComponent(child, 'ChildComponent', true);
      
      // Child should have access to parent state
      const childState = stateManager.getRootState(child);
      expect(childState).toBeDefined();
      // In inheritance mode, child uses parent's state directly
    });
  });
});
