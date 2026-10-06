// マス目のマップ。座標はマス単位で、マス(x, y)の中心が座標(x, y)になる。

import { TERRAIN, type TerrainId } from '../data/terrain';

export interface GridPoint {
  x: number;
  y: number;
}

export interface Tile {
  terrain: TerrainId;
  /** このマスに建っているタワーの番号 */
  towerUid: number | null;
}

export interface Grid {
  width: number;
  height: number;
  tiles: Tile[];
}

/** 上下左右 */
export const DIRECTIONS: readonly GridPoint[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export function createGrid(width: number, height: number): Grid {
  const tiles: Tile[] = [];
  for (let i = 0; i < width * height; i++) tiles.push({ terrain: 'plain', towerUid: null });
  return { width, height, tiles };
}

export function inBounds(grid: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height;
}

export function tileIndex(grid: Grid, x: number, y: number): number {
  return y * grid.width + x;
}

export function tileAt(grid: Grid, x: number, y: number): Tile {
  return grid.tiles[tileIndex(grid, x, y)];
}

/** 地上の敵・英雄が通れるか */
export function isGroundPassable(grid: Grid, x: number, y: number): boolean {
  if (!inBounds(grid, x, y)) return false;
  const tile = tileAt(grid, x, y);
  return TERRAIN[tile.terrain].groundPassable && tile.towerUid === null;
}

/** このマスを1マス分進むのにかかる時間の倍率（遅い地形ほど大きい） */
export function stepCost(grid: Grid, x: number, y: number): number {
  return 1 / TERRAIN[tileAt(grid, x, y).terrain].speedMultiplier;
}

/** 連続した座標が乗っているマス */
export function tileOf(pos: GridPoint): GridPoint {
  return { x: Math.round(pos.x), y: Math.round(pos.y) };
}

export function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function samePoint(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y;
}
