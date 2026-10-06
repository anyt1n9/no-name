import { describe, expect, it } from 'vitest';
import { createGrid, tileAt, tileIndex } from '../src/core/grid';
import { computeDistanceField, findPath, traceRoute } from '../src/core/pathfinding';
import type { TerrainId } from '../src/data/terrain';

/** 文字の地図からマップを作る。. = 草原, M = 山, F = 森 */
function gridFrom(rows: string[]) {
  const grid = createGrid(rows[0].length, rows.length);
  const kinds: Record<string, TerrainId> = { '.': 'plain', M: 'mountain', F: 'forest' };
  rows.forEach((row, y) => [...row].forEach((ch, x) => (tileAt(grid, x, y).terrain = kinds[ch])));
  return grid;
}

describe('道探し', () => {
  it('何もなければまっすぐ進む', () => {
    const grid = gridFrom(['.....']);
    const field = computeDistanceField(grid, { x: 4, y: 0 });
    expect(traceRoute(grid, field, { x: 0, y: 0 })).toHaveLength(5);
  });

  it('山があれば回り道をする', () => {
    const grid = gridFrom([
      '.....',
      '..M..',
      '.....',
    ]);
    const route = findPath(grid, { x: 0, y: 1 }, { x: 4, y: 1 })!;
    expect(route.some((p) => p.x === 2 && p.y === 1)).toBe(false);
    expect(route[route.length - 1]).toEqual({ x: 4, y: 1 });
  });

  it('森を1マス抜けるほうが早ければ森を通る', () => {
    // 森は遅いが、回り道は2マス余計にかかるので森を抜けたほうが早い
    const grid = gridFrom([
      '.....',
      '..F..',
      '.....',
    ]);
    const route = findPath(grid, { x: 0, y: 1 }, { x: 4, y: 1 })!;
    expect(route.some((p) => p.x === 2 && p.y === 1)).toBe(true);
  });

  it('回り道のほうが早ければ森を避ける', () => {
    const grid = gridFrom([
      '.......',
      '..FFF..',
      '.......',
    ]);
    const route = findPath(grid, { x: 0, y: 1 }, { x: 6, y: 1 })!;
    expect(route.some((p) => p.y === 1 && p.x >= 2 && p.x <= 4)).toBe(false);
  });

  it('森しか道がなければ森を通る', () => {
    const grid = gridFrom([
      '..M..',
      '..F..',
      '..M..',
    ]);
    const route = findPath(grid, { x: 0, y: 1 }, { x: 4, y: 1 })!;
    expect(route.some((p) => p.x === 2 && p.y === 1)).toBe(true);
  });

  it('完全に塞がれていればたどり着けない', () => {
    const grid = gridFrom([
      '..M..',
      '..M..',
      '..M..',
    ]);
    const field = computeDistanceField(grid, { x: 4, y: 1 });
    expect(field[tileIndex(grid, 0, 1)]).toBe(Infinity);
    expect(findPath(grid, { x: 0, y: 1 }, { x: 4, y: 1 })).toBeNull();
  });
});
