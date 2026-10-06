// ステージのマップをシード値から作る。

import type { StageDef } from '../data/stage';
import type { TerrainCardId } from '../data/terrain';
import { createGrid, tileAt, tileIndex, type Grid, type GridPoint } from './grid';
import { computeDistanceField } from './pathfinding';
import { nextInt, shuffle, type Rng } from './rng';

export interface GeneratedMap {
  grid: Grid;
  entrance: GridPoint;
  castle: GridPoint;
}

export function generateMap(stage: StageDef, rng: Rng): GeneratedMap {
  const grid = createGrid(stage.width, stage.height);
  const entrance = { x: 0, y: nextInt(rng, 2, stage.height - 3) };
  const castle = { x: stage.width - 1, y: nextInt(rng, 2, stage.height - 3) };

  // 入口と城のまわり2列は空けておく
  const candidates: GridPoint[] = [];
  for (let x = 2; x <= stage.width - 3; x++) {
    for (let y = 0; y < stage.height; y++) candidates.push({ x, y });
  }
  shuffle(rng, candidates);

  const remaining: Record<TerrainCardId, number> = { ...stage.preplaced };
  for (const point of candidates) {
    const tile = tileAt(grid, point.x, point.y);
    if (remaining.mountain > 0) {
      tile.terrain = 'mountain';
      // 山で道が完全に塞がるなら置かない
      if (computeDistanceField(grid, castle)[tileIndex(grid, entrance.x, entrance.y)] === Infinity) {
        tile.terrain = 'plain';
      } else {
        remaining.mountain--;
      }
    } else if (remaining.forest > 0) {
      tile.terrain = 'forest';
      remaining.forest--;
    } else {
      break;
    }
  }
  return { grid, entrance, castle };
}
