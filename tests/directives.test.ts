/**
 * IMPETUS FRAMEWORK - Directives Tests
 *
 * Verifies structural and visibility directives, especially @if reinsertion
 * after initial removal and subsequent toggling.
 */

import { describe, test, expect, beforeEach, afterEach, flushMicrotasks } from './setup';
import { stateManager, makeReactive } from '../src/state';
import { collectBindingsForRoot } from '../src/bindings';
import { renderBindings } from '../src/render';

describe('Directives', () => {
  beforeEach(() => {
    (document.body as any).innerHTML = '';
    stateManager.clear();
  });

  afterEach(() => {
    (document.body as any).innerHTML = '';
    stateManager.clear();
  });

  test('@if toggles element presence (false -> true -> false)', async () => {
    const root = document.createElement('div') as any;
    const block = document.createElement('div');
    block.setAttribute('@if', 'agree');
    block.className = 'cond';
    root.appendChild(block);

    const initial = { agree: false } as any;
    const state = makeReactive(initial, root, true);
    stateManager.setRootState(root, state);
    stateManager.addRoot(root);

    collectBindingsForRoot(root);
    renderBindings(state, root);
    // Allow any scheduled effects to run
    await flushMicrotasks();
    // Initially false: block should be removed
    expect(root.children.includes(block)).toBe(false);

    // Toggle to true: block should reappear
    state.agree = true;
    await flushMicrotasks();
    expect(root.children.includes(block)).toBe(true);

    // Toggle back to false: block should be removed again
    state.agree = false;
    await flushMicrotasks();
    expect(root.children.includes(block)).toBe(false);
  });
});
