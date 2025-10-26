import type { Scope } from "./types";

type RenderBindingsFn = (state: Scope, root: Element) => void;
type WireEventHandlersFn = (root: Element, state: Scope) => void;
type DestroyFn = (root: Element) => void;
type MountComponentFn = (host: Element, className: string, inherit: boolean) => void;

type RuntimeApi = {
  renderBindings: RenderBindingsFn;
  wireEventHandlers: WireEventHandlersFn;
  destroy: DestroyFn;
  mountComponent: MountComponentFn;
};

let api: RuntimeApi | undefined;

export function registerRuntimeApi(next: RuntimeApi): void {
  api = next;
}

function ensureApi(): RuntimeApi {
  if (!api) throw new Error("impetus runtime api not registered");
  return api;
}

export function getRenderBindings(): RenderBindingsFn {
  return ensureApi().renderBindings;
}

export function getWireEventHandlers(): WireEventHandlersFn {
  return ensureApi().wireEventHandlers;
}

export function getDestroy(): DestroyFn {
  return ensureApi().destroy;
}

export function getMountComponent(): MountComponentFn {
  return ensureApi().mountComponent;
}
