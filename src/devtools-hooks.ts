/**
 * Shared devtools hook storage used across the framework.
 */

import type { DevtoolsHooks } from "./types";

let currentHooks: DevtoolsHooks | undefined;

export function setDevtoolsHooks(hooks: DevtoolsHooks): void {
  currentHooks = { ...currentHooks, ...hooks };
}

export function getDevtoolsHooks(): DevtoolsHooks | undefined {
  return currentHooks;
}
