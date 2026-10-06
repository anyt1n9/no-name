// ステージのマップをシード値から作る。
// 山脈（すき間のある山の列）・湖・森・岩山を組み合わせて、毎回ちがう形の土地にする。

import type { StageDef } from '../data/stage';
import type { TerrainId } from '../data/terrain';
import { createGrid, DIRECTIONS, inBounds, tileAt, tileIndex, type Grid, type GridPoint } from './grid';
import { computeDistanceField } from './pathfinding';
import { nextFloat, nextInt, pick, type Rng } from './rng';

export interface GeneratedMap {
  grid: Grid;
  entrance: GridPoint;
  castle: GridPoint;
}

interface MapContext {
  grid: Grid;
  entrance: GridPoint;
  castle: GridPoint;
  /** 入口と城のまわりなど、地形を置かずに空けておくマス */
  reserved: Set<number>;
  rng: Rng;
}

export function generateMap(stage: StageDef, rng: Rng): GeneratedMap {
  const grid = createGrid(stage.width, stage.height);
  const entrance = pickEdgePoint(stage, rng, 'left');
  const castle = pickEdgePoint(stage, rng, 'right');
  const reserved = new Set<number>();
  for (let y = 0; y < stage.height; y++) {
    for (let x = 0; x < stage.width; x++) {
      const near = (p: GridPoint) => Math.abs(p.x - x) + Math.abs(p.y - y) <= 2;
      if (near(entrance) || near(castle)) reserved.add(tileIndex(grid, x, y));
    }
  }
  const context: MapContext = { grid, entrance, castle, reserved, rng };
  const { ridges, lakes, groves, rocks } = stage.map;

  for (let i = nextInt(rng, ridges[0], ridges[1]); i > 0; i--) placeRidge(context);
  for (let i = nextInt(rng, lakes[0], lakes[1]); i > 0; i--) placeBlob(context, 'lake', nextInt(rng, 4, 7));
  for (let i = nextInt(rng, groves[0], groves[1]); i > 0; i--) placeBlob(context, 'forest', nextInt(rng, 3, 6));
  for (let i = nextInt(rng, rocks[0], rocks[1]); i > 0; i--) placeRock(context);

  return { grid, entrance, castle };
}

/** 入口は左側、城は右側に置く。たまに上下の端にずらして、向きに変化をつける */
function pickEdgePoint(stage: StageDef, rng: Rng, side: 'left' | 'right'): GridPoint {
  const { width, height } = stage;
  const roll = nextFloat(rng);
  if (roll < 0.6) {
    return { x: side === 'left' ? 0 : width - 1, y: nextInt(rng, 1, height - 2) };
  }
  const x = side === 'left' ? nextInt(rng, 1, 3) : nextInt(rng, width - 4, width - 2);
  return { x, y: roll < 0.8 ? 0 : height - 1 };
}

/** 通れない地形を置く。置くと入口から城へ行けなくなる場合は置かない */
function placeBlocking(context: MapContext, x: number, y: number, terrain: TerrainId): boolean {
  const { grid, castle, entrance } = context;
  if (!canUse(context, x, y)) return false;
  const index = tileIndex(grid, x, y);
  if (computeDistanceField(grid, castle, index)[tileIndex(grid, entrance.x, entrance.y)] === Infinity) return false;
  tileAt(grid, x, y).terrain = terrain;
  return true;
}

function canUse(context: MapContext, x: number, y: number): boolean {
  const { grid, reserved } = context;
  return inBounds(grid, x, y) && !reserved.has(tileIndex(grid, x, y)) && tileAt(grid, x, y).terrain === 'plain';
}

/** 山脈：マップを横切る山の列。1〜2か所のすき間が自然な通り道（関所）になる */
function placeRidge(context: MapContext): void {
  const { grid, rng } = context;
  const { width, height } = grid;
  const drift = (value: number, min: number, max: number) =>
    nextFloat(rng) < 0.25 ? Math.max(min, Math.min(max, value + (nextFloat(rng) < 0.5 ? -1 : 1))) : value;

  if (nextFloat(rng) < 0.75) {
    // 縦の山脈：敵の進む向きを横切る
    let x = nextInt(rng, 4, width - 5);
    const gaps = new Set<number>();
    for (let i = nextInt(rng, 1, 2); i > 0; i--) {
      const gapY = nextInt(rng, 1, height - 2);
      gaps.add(gapY);
      if (nextFloat(rng) < 0.5) gaps.add(gapY + 1);
    }
    for (let y = 0; y < height; y++) {
      x = drift(x, 3, width - 4);
      if (!gaps.has(y)) placeBlocking(context, x, y, 'mountain');
    }
  } else {
    // 横の山脈：敵の進む向きに沿って、通路を分ける
    let y = nextInt(rng, 2, height - 3);
    const start = nextInt(rng, 3, 6);
    const length = nextInt(rng, 4, 7);
    for (let x = start; x < Math.min(width - 3, start + length); x++) {
      y = drift(y, 1, height - 2);
      placeBlocking(context, x, y, 'mountain');
    }
  }
}

/** 湖や森のかたまりを、1マスから少しずつ広げて作る */
function placeBlob(context: MapContext, terrain: TerrainId, size: number): void {
  const { grid, rng } = context;
  const place = (x: number, y: number) => {
    if (terrain === 'forest') {
      if (!canUse(context, x, y)) return false;
      tileAt(grid, x, y).terrain = 'forest';
      return true;
    }
    return placeBlocking(context, x, y, terrain);
  };

  let start: GridPoint | null = null;
  for (let attempt = 0; attempt < 12 && !start; attempt++) {
    const candidate = { x: nextInt(rng, 3, grid.width - 4), y: nextInt(rng, 0, grid.height - 1) };
    if (place(candidate.x, candidate.y)) start = candidate;
  }
  if (!start) return;

  const cells: GridPoint[] = [start];
  for (let attempt = 0; cells.length < size && attempt < 40; attempt++) {
    const base = pick(rng, cells);
    const dir = pick(rng, DIRECTIONS);
    const next = { x: base.x + dir.x, y: base.y + dir.y };
    if (place(next.x, next.y)) cells.push(next);
  }
}

/** ぽつんと立つ岩山 */
function placeRock(context: MapContext): void {
  const { grid, rng } = context;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (placeBlocking(context, nextInt(rng, 2, grid.width - 3), nextInt(rng, 0, grid.height - 1), 'mountain')) return;
  }
}
