import { createRow, uid } from './defaults';
import type { Block, Column, Design, Row } from './types';

export interface BlockLoc { row: Row; rowIndex: number; column: Column; columnIndex: number; index: number; block: Block }

export function findBlock(d: Design, id: string): BlockLoc | null {
  for (let rowIndex = 0; rowIndex < d.rows.length; rowIndex++) {
    const row = d.rows[rowIndex];
    for (let columnIndex = 0; columnIndex < row.columns.length; columnIndex++) {
      const column = row.columns[columnIndex];
      const index = column.blocks.findIndex((b) => b.id === id);
      if (index >= 0) return { row, rowIndex, column, columnIndex, index, block: column.blocks[index] };
    }
  }
  return null;
}

export const findRow = (d: Design, id: string) => d.rows.find((r) => r.id === id) ?? null;

export function findColumn(d: Design, id: string): { row: Row; column: Column } | null {
  for (const row of d.rows) {
    const column = row.columns.find((c) => c.id === id);
    if (column) return { row, column };
  }
  return null;
}

/** Deep-clone with fresh ids so duplicates never collide. */
export function cloneWithNewIds<T extends Block | Row>(item: T): T {
  const copy = structuredClone(item) as any;
  copy.id = uid(copy.type ? 'blk' : 'row');
  if (copy.columns) for (const c of copy.columns) { c.id = uid('col'); for (const b of c.blocks) b.id = uid('blk'); }
  return copy;
}

export function insertBlock(d: Design, columnId: string, index: number, block: Block): boolean {
  const loc = findColumn(d, columnId);
  if (!loc) return false;
  const i = Math.max(0, Math.min(index, loc.column.blocks.length));
  loc.column.blocks.splice(i, 0, block);
  return true;
}

export function removeBlock(d: Design, id: string): Block | null {
  const loc = findBlock(d, id);
  if (!loc) return null;
  loc.column.blocks.splice(loc.index, 1);
  return loc.block;
}

export function moveBlock(d: Design, id: string, toColumnId: string, toIndex: number): boolean {
  const loc = findBlock(d, id);
  const target = findColumn(d, toColumnId);
  if (!loc || !target) return false;
  loc.column.blocks.splice(loc.index, 1);
  // removing an earlier item in the same column shifts the target index
  if (loc.column === target.column && loc.index < toIndex) toIndex--;
  target.column.blocks.splice(Math.max(0, Math.min(toIndex, target.column.blocks.length)), 0, loc.block);
  return true;
}

export function shiftBlock(d: Design, id: string, delta: -1 | 1): void {
  const loc = findBlock(d, id);
  if (!loc) return;
  const j = loc.index + delta;
  if (j < 0 || j >= loc.column.blocks.length) return;
  [loc.column.blocks[loc.index], loc.column.blocks[j]] = [loc.column.blocks[j], loc.column.blocks[loc.index]];
}

export function duplicateBlock(d: Design, id: string): Block | null {
  const loc = findBlock(d, id);
  if (!loc) return null;
  const copy = cloneWithNewIds(loc.block);
  loc.column.blocks.splice(loc.index + 1, 0, copy);
  return copy;
}

export function insertRow(d: Design, index: number, row: Row): void {
  d.rows.splice(Math.max(0, Math.min(index, d.rows.length)), 0, row);
}

export function removeRow(d: Design, id: string): void {
  d.rows = d.rows.filter((r) => r.id !== id);
}

export function moveRow(d: Design, id: string, toIndex: number): void {
  const from = d.rows.findIndex((r) => r.id === id);
  if (from < 0) return;
  const [row] = d.rows.splice(from, 1);
  if (from < toIndex) toIndex--;
  d.rows.splice(Math.max(0, Math.min(toIndex, d.rows.length)), 0, row);
}

export function shiftRow(d: Design, id: string, delta: -1 | 1): void {
  const i = d.rows.findIndex((r) => r.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= d.rows.length) return;
  [d.rows[i], d.rows[j]] = [d.rows[j], d.rows[i]];
}

export function duplicateRow(d: Design, id: string): Row | null {
  const i = d.rows.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const copy = cloneWithNewIds(d.rows[i]);
  d.rows.splice(i + 1, 0, copy);
  return copy;
}

/** Change a row's column layout. Blocks of removed columns are appended to the last remaining column. */
export function setRowLayout(row: Row, ratios: number[]): void {
  const next = createRow(ratios);
  const cols: Column[] = row.columns.slice(0, ratios.length);
  while (cols.length < ratios.length) cols.push(next.columns[cols.length]);
  const overflow = row.columns.slice(ratios.length).flatMap((c) => c.blocks);
  cols[cols.length - 1].blocks.push(...overflow);
  row.columns = cols;
  row.ratios = [...ratios];
}
