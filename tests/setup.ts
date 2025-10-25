// Setup DOM for tests
import { expect, test, describe, beforeEach, afterEach, beforeAll, afterAll, spyOn } from "bun:test";

// Create a simple DOM mock
class MockElement {
  tagName: string;
  attributes: Array<{ name: string; value: string }> = [];
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
  classList = {
    add: () => {},
    remove: () => {},
    contains: () => false,
  };

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string) {
    const existing = this.attributes.find(a => a.name === name);
    if (existing) {
      existing.value = value;
    } else {
      this.attributes.push({ name, value });
    }
  }

  getAttribute(name: string): string | null {
    const attr = this.attributes.find(a => a.name === name);
    return attr ? attr.value : null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.some(a => a.name === name);
  }

  removeAttribute(name: string) {
    this.attributes = this.attributes.filter(a => a.name !== name);
  }

  appendChild(child: MockElement) {
    this.children.push(child);
    child.parentNode = this;
    child.parentElement = this;
    
    // Set up sibling relationships
    if (this.children.length > 1) {
      const prevChild = this.children[this.children.length - 2];
      if (prevChild) {
        prevChild.nextSibling = child;
        prevChild.nextElementSibling = child;
      }
    }
  }

  removeChild(child: MockElement) {
    const index = this.children.indexOf(child);
    if (index > -1) {
      this.children.splice(index, 1);
      child.parentNode = null;
      child.parentElement = null;
      
      // Update sibling relationships
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

  querySelectorAll(): MockElement[] {
    return [];
  }

  querySelector(): MockElement | null {
    return null;
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {}
  contains() { return false; }
  scrollIntoView() {}
}

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

class MockComment {
  nodeValue: string;
  parentNode: MockElement | null = null;

  constructor(text: string) {
    this.nodeValue = text;
  }
}

// Ensure DOM is available
if (typeof document === 'undefined') {
  global.document = {
    createElement: (tag: string) => new MockElement(tag),
    createTextNode: (text: string) => new MockText(text),
    createComment: (text: string) => new MockComment(text),
    querySelectorAll: () => [],
    querySelector: () => null,
    body: { appendChild: () => {} },
  } as any;
  
  global.window = {
    CustomEvent: class CustomEvent {},
    Event: class Event {},
    HTMLElement: MockElement,
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
      content = { cloneNode: () => new MockElement('div') };
      constructor() {
        super('template');
      }
    },
    NodeFilter: { SHOW_TEXT: 4 },
    document: global.document,
  } as any;
  
  global.Element = MockElement as any;
  global.Node = class Node {} as any;
  global.Text = MockText as any;
  global.Comment = MockComment as any;
  global.EventTarget = class EventTarget {} as any;
  global.HTMLElement = MockElement as any;
  global.HTMLInputElement = global.window.HTMLInputElement as any;
  global.HTMLTextAreaElement = global.window.HTMLTextAreaElement as any;
  global.HTMLSelectElement = global.window.HTMLSelectElement as any;
  global.HTMLTemplateElement = global.window.HTMLTemplateElement as any;
}

// Export for use in tests
export { expect, test, describe, beforeEach, afterEach, beforeAll, afterAll, spyOn };
