import type { Design } from './types';

export type Selection = { kind: 'body' } | { kind: 'row'; id: string } | { kind: 'block'; id: string };
/** What the UI should refresh after a change. */
export type RenderScope = 'all' | 'canvas' | 'none';

export interface ChangeOptions {
  render?: RenderScope;
  /** Consecutive changes with the same key within 800ms share one undo step (typing, dragging sliders). */
  coalesceKey?: string;
}

const COALESCE_MS = 800;
const HISTORY_LIMIT = 100;

export class EditorStore {
  design: Design;
  selection: Selection = { kind: 'body' };
  private past: string[] = [];
  private future: string[] = [];
  private lastKey = '';
  private lastTime = 0;
  private listeners = new Set<(scope: RenderScope) => void>();

  constructor(design: Design) {
    this.design = structuredClone(design);
  }

  subscribe(fn: (scope: RenderScope) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(scope: RenderScope) {
    for (const fn of this.listeners) fn(scope);
  }

  change(mutator: (d: Design) => void, opts: ChangeOptions = {}): void {
    const now = Date.now();
    const coalesce = !!opts.coalesceKey && opts.coalesceKey === this.lastKey && now - this.lastTime < COALESCE_MS;
    if (!coalesce) {
      this.past.push(JSON.stringify(this.design));
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
    }
    this.lastKey = opts.coalesceKey ?? '';
    this.lastTime = now;
    this.future = [];
    mutator(this.design);
    this.emit(opts.render ?? 'all');
  }

  select(sel: Selection): void {
    this.selection = sel;
    this.emit('all');
  }

  replace(design: Design): void {
    this.design = structuredClone(design);
    this.past = [];
    this.future = [];
    this.selection = { kind: 'body' };
    this.emit('all');
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  undo(): void {
    const prev = this.past.pop();
    if (prev === undefined) return;
    this.future.push(JSON.stringify(this.design));
    this.design = JSON.parse(prev);
    this.lastKey = '';
    this.fixSelection();
    this.emit('all');
  }

  redo(): void {
    const next = this.future.pop();
    if (next === undefined) return;
    this.past.push(JSON.stringify(this.design));
    this.design = JSON.parse(next);
    this.lastKey = '';
    this.fixSelection();
    this.emit('all');
  }

  private fixSelection() {
    const s = this.selection;
    if (s.kind === 'body') return;
    const exists = JSON.stringify(this.design).includes(`"id":"${s.id}"`);
    if (!exists) this.selection = { kind: 'body' };
  }
}
