/**
 * Test setup and DOM mocking for the Impetus framework
 * 
 * This file sets up the testing environment for the framework.
 * Since the tests run in a Node.js environment (not a browser),
 * we need to mock the DOM APIs that the framework relies on.
 * 
 * The mock implementations provide just enough functionality
 * for the tests to run without needing a full browser environment.
 * This makes tests faster and more reliable.
 */

// Import testing utilities from Bun's test framework
import { expect, test, describe, beforeEach, afterEach, beforeAll, afterAll, spyOn } from "bun:test";

const templateRegistry = new Map<string, any>();

/**
 * Mock DOM Element class
 * 
 * This is a simplified implementation of a DOM Element that provides
 * the basic functionality needed for the framework to work in tests.
 * It implements the most commonly used DOM methods and properties.
 * 
 * Note: This is NOT a complete DOM implementation - it only includes
 * what the framework actually uses in tests. Real DOM behavior is much
 * more complex, but we keep it simple for test performance.
 */
class MockElement {
  tagName: string;
  children: MockElement[] = [];
  parentNode: MockElement | null = null;
  nextSibling: MockElement | null = null;
  nextElementSibling: MockElement | null = null;
  parentElement: MockElement | null = null;
  textContent = '';
  nodeValue: string | null = null;
  isConnected = true;
  style: Record<string, string> = {};
  hidden = false;
  value = '';
  innerHTML = '';
  firstChild: MockElement | null = null;
  className = '';
  classList = {
    add: () => {},
    remove: () => {},
    contains: () => false,
  };

  // Private attributes storage
  private _attributes: Array<{ name: string; value: string }> = [];
  
  // Add getter for attributes property to support Array.from(host.attributes)
  get attributes(): Array<{ name: string; value: string }> {
    return this._attributes;
  }
  
  set attributes(attrs: Array<{ name: string; value: string }>) {
    this._attributes = attrs;
  }

  /**
   * Create a new mock element
   * 
   * @param tagName - The HTML tag name (e.g., 'div', 'span', 'input')
   */
  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  /**
   * Set an attribute on the element
   * 
   * If the attribute already exists, its value is updated.
   * Otherwise, a new attribute is added.
   * 
   * @param name - The attribute name
   * @param value - The attribute value
   */
  setAttribute(name: string, value: string) {
    const existing = this.attributes.find(a => a.name === name);
    if (existing) {
      existing.value = value;
    } else {
      this.attributes.push({ name, value });
    }
  }

  /**
   * Get the value of an attribute
   * 
   * @param name - The attribute name to look up
   * @returns The attribute value or null if not found
   */
  getAttribute(name: string): string | null {
    const attr = this.attributes.find(a => a.name === name);
    return attr ? attr.value : null;
  }

  /**
   * Check if an attribute exists on the element
   * 
   * @param name - The attribute name to check
   * @returns True if the attribute exists
   */
  hasAttribute(name: string): boolean {
    return this.attributes.some(a => a.name === name);
  }

  /**
   * Remove an attribute from the element
   * 
   * If the attribute doesn't exist, nothing happens.
   * 
   * @param name - The attribute name to remove
   */
  removeAttribute(name: string) {
    this.attributes = this.attributes.filter(a => a.name !== name);
  }

  /**
   * Add a child element to this element
   * 
   * This also sets up the parent and sibling relationships
   * between nodes, which is important for DOM traversal.
   * 
   * @param child - The child element to add
   */
  appendChild(child: MockElement) {
    this.children.push(child);
    child.parentNode = this;
    child.parentElement = this;
    
    // Set firstChild if this is the first child
    if (this.children.length === 1) {
      this.firstChild = child;
    }
    
    // Set up sibling relationships
    // This ensures nextSibling and nextElementSibling work correctly
    if (this.children.length > 1) {
      const prevChild = this.children[this.children.length - 2];
      if (prevChild) {
        prevChild.nextSibling = child;
        prevChild.nextElementSibling = child;
      }
    }
  }

  /**
   * Remove a child element from this element
   * 
   * This cleans up all parent and sibling references to prevent
   * memory leaks and maintain a consistent DOM tree structure.
   * 
   * @param child - The child element to remove
   */
  removeChild(child: MockElement) {
    const index = this.children.indexOf(child);
    if (index > -1) {
      this.children.splice(index, 1);
      child.parentNode = null;
      child.parentElement = null;
      
      // Update sibling relationships
      // This is important to keep the DOM tree consistent
      if (index > 0 && index < this.children.length) {
        const prevChild = this.children[index - 1];
        const nextChild = this.children[index];
        if (prevChild && nextChild) {
          prevChild.nextSibling = nextChild;
          prevChild.nextElementSibling = nextChild;
        }
      } else if (index > 0) {
        const prevChild = this.children[index - 1];
        if (prevChild) {
          prevChild.nextSibling = null;
          prevChild.nextElementSibling = null;
        }
      }
    }
  }

  /**
   * Insert a child element before a reference element
   * 
   * If reference is null, the child is appended at the end.
   * This method updates all sibling relationships to maintain
   * a consistent DOM tree structure.
   * 
   * @param child - The child element to insert
   * @param reference - The element to insert before (or null)
   */
  insertBefore(child: MockElement, reference: MockElement | null) {
    if (reference) {
      const index = this.children.indexOf(reference);
      this.children.splice(index, 0, child);
    } else {
      this.children.push(child);
    }
    child.parentNode = this;
    child.parentElement = this;
    
    // Update sibling relationships
    // This is simplified - in a real DOM this would be more complex
    for (let i = 0; i < this.children.length - 1; i++) {
      const currentChild = this.children[i];
      const nextChild = this.children[i + 1];
      if (currentChild && nextChild) {
        currentChild.nextSibling = nextChild;
        currentChild.nextElementSibling = nextChild;
      }
    }
    if (this.children.length > 0) {
      const lastChild = this.children[this.children.length - 1];
      if (lastChild) {
        lastChild.nextSibling = null;
        lastChild.nextElementSibling = null;
      }
    }
  }

  /**
   * Mock implementation of querySelectorAll
   * 
   * Returns an empty array since our mock doesn't implement
   * CSS selector parsing. This is sufficient for current tests.
   */
  querySelectorAll(): MockElement[] {
    return [];
  }

  /**
   * Mock implementation of querySelector
   * 
   * Returns elements with matching class names for basic functionality
   */
  querySelector(selector: string): MockElement | null {
    // Simple class selector support
    if (selector.startsWith('.')) {
      const className = selector.slice(1);
      for (const child of this.children) {
        if (child.className === className) {
          return child;
        }
      }
    }
    return null;
  }

  /**
   * Mock implementation of getBoundingClientRect
   * 
   * Returns a default rectangle with zero dimensions.
   * This is used by the devtools for positioning.
   */
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  /**
   * Mock event methods
   * 
   * These are empty implementations since the tests
   * don't need to actually handle events.
   */
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {}
  contains() { return false; }
  scrollIntoView() {}
}

/**
 * Mock DOM Text node class
 * 
 * Text nodes contain the actual text content in a DOM tree.
 * They have nodeValue and textContent properties that hold the text.
 */
class MockText {
  nodeValue: string;
  textContent: string;
  parentNode: MockElement | null = null;
  parentElement: MockElement | null = null;

  constructor(text: string) {
    this.nodeValue = text;
    this.textContent = text;
  }
}

/**
 * Mock DOM Comment node class
 * 
 * Comment nodes represent HTML comments <!-- like this -->.
 * They're used by the framework for template markers.
 */
class MockComment {
  nodeValue: string;
  parentNode: MockElement | null = null;

  constructor(text: string) {
    this.nodeValue = text;
  }
}

/**
 * Set up global DOM mocks if running in Node.js
 * 
 * The framework expects browser DOM APIs to be available.
 * When running tests in Node.js, we need to provide mock implementations.
 * This checks if the document object exists and creates mocks if not.
 * 
 * This approach allows the same code to run in both browser and test
 * environments without modification.
 */
if (typeof document === 'undefined') {
  // Mock the document object with basic DOM creation methods
  global.document = {
    createElement: (tag: string) => {
      const element = new MockElement(tag);
      if (tag === 'template') {
        (element as any).content = {
          children: [],
          appendChild: (child: any) => {
            (element as any).content.children.push(child);
          },
          cloneNode: () => new MockElement('div')
        };
      }
      return element;
    },
    createTextNode: (text: string) => new MockText(text),
    createComment: (text: string) => new MockComment(text),
    createDocumentFragment: () => new MockElement('div'), // Simple mock
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
    body: { appendChild: () => {} },
  } as any;
  
  // Mock the window object with browser-specific classes
  // These are needed because the framework checks instance types
  global.window = {
    CustomEvent: class CustomEvent {},
    Event: class Event {},
    HTMLElement: MockElement,
    // Specific element types that the framework might check for
    HTMLInputElement: class HTMLInputElement extends MockElement {
      constructor() {
        super('input');
      }
    },
    HTMLTextAreaElement: class HTMLTextAreaElement extends MockElement {
      constructor() {
        super('textarea');
      }
    },
    HTMLSelectElement: class HTMLSelectElement extends MockElement {
      constructor() {
        super('select');
      }
    },
    HTMLTemplateElement: class HTMLTemplateElement extends MockElement {
      // Template elements have a content property that holds a document fragment
      content = { cloneNode: () => new MockElement('div') };
      constructor() {
        super('template');
      }
    },
    NodeFilter: { SHOW_TEXT: 4 }, // Used by TreeWalker API
    document: global.document,
  } as any;
  
  // Set up global constructors for DOM classes
  // This allows code to use 'new Element()' etc.
  global.Element = MockElement as any;
  global.Node = class Node {} as any;
  global.Text = MockText as any;
  global.Comment = MockComment as any;
  global.EventTarget = class EventTarget {} as any;
  global.HTMLElement = MockElement as any;
  // Make specific element types available globally too
  global.HTMLInputElement = global.window.HTMLInputElement as any;
  global.HTMLTextAreaElement = global.window.HTMLTextAreaElement as any;
  global.HTMLSelectElement = global.window.HTMLSelectElement as any;
  global.HTMLTemplateElement = global.window.HTMLTemplateElement as any;
}

const originalGetElementById = document.getElementById?.bind(document);
(document as any).getElementById = (id: string) => {
  if (templateRegistry.has(id)) {
    return templateRegistry.get(id);
  }
  return originalGetElementById ? originalGetElementById(id) : null;
};

if (!(global as any).window.makeReactive) {
  (global as any).window.makeReactive = (obj: any, element: Element, isRoot?: boolean) => {
    return new Proxy(obj, {
      set(target, prop, value) {
        target[prop as any] = value;
        if (isRoot) {
          setTimeout(() => {
            (global as any).window.renderBindings?.(target, element);
          }, 0);
        }
        return true;
      }
    });
  };
}

if (!(global as any).window.collectBindingsForRoot) {
  (global as any).window.collectBindingsForRoot = () => {};
}

if (!(global as any).window.renderBindings) {
  (global as any).window.renderBindings = () => {};
}

if (!(global as any).window.wireEventHandlers) {
  (global as any).window.wireEventHandlers = () => {};
}

if (!(global as any).window.devhooks) {
  (global as any).window.devhooks = { onInitRoot: () => {} };
}

export function createGlobalComponent(name: string, classDef: any) {
  (globalThis as any)[name] = classDef;
  (global as any).window[name] = classDef;
}

export function mountHost(componentName: string, attrs: Record<string, string | number> = {}) {
  const host = document.createElement('div') as any;
  host.setAttribute('use', componentName);
  for (const [key, value] of Object.entries(attrs)) {
    host.setAttribute(key, String(value));
  }
  (document.body as any)?.appendChild?.(host);
  return host;
}

export function registerTemplate(id: string, nodeFactory: () => Element | null = () => document.createElement('div')) {
  const template = document.createElement('template') as any;
  template.id = id;
  template.tagName = 'TEMPLATE';
  template.content = {
    children: [],
    appendChild: (child: any) => {
      template.content.children.push(child);
    },
    cloneNode: () => nodeFactory()?.cloneNode?.(true) ?? nodeFactory()
  };
  templateRegistry.set(id, template);
  return template;
}

export const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

export function withConsoleSpies() {
  const warn = spyOn(console, 'warn').mockImplementation(() => {});
  const error = spyOn(console, 'error').mockImplementation(() => {});
  return () => {
    warn.mockRestore();
    error.mockRestore();
  };
}

/**
 * Export testing utilities for use in test files
 * 
 * This centralizes all test imports in one place, making it easier
 * to manage dependencies and switch test frameworks if needed.
 */
export {
  expect,
  test,
  describe,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  spyOn
};
