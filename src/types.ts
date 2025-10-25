export type Scope = Record<string, any>;

export type AttrBinding = { el: Element; attr: string; expr: string };
export type InterpBinding = { node: Text; template: string };

export type DevtoolsHooks = {
  onInitRoot?: (root: Element, state: Scope) => void;
  onCollect?: (root: Element, counts: { attrs: number; interps: number }) => void;
  onRenderStart?: (root: Element) => void;
  onRenderEnd?: (root: Element, stats: { duration: number }) => void;
  onDirective?: (el: Element, type: string, meta?: any) => void;
  onWireEvents?: (root: Element, count: number) => void;
  onDestroy?: (root: Element) => void;
};

export type EventHandler = { el: EventTarget; event: string; handler: EventListener };

export interface DirectiveHandler {
  (el: Element, expr: string, state: Scope, root?: Element): void;
}

export interface AttributeHandler {
  (el: Element, expr: string, raw: string, state: Scope, root: Element): boolean;
}
