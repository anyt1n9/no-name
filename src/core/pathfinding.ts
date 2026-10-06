// 道探し。目的地からの「到着までにかかる時間」を全マスについて計算した表（距離場）を作り、
// 敵はその値が小さくなる方向へ進む。地形を置くたびに表を作り直せば、敵のルートも自動で変わる。

import { DIRECTIONS, inBounds, isGroundPassable, stepCost, tileIndex, type Grid, type GridPoint } from './grid';

/** 2つの隣り合うマスの間を移動するのにかかる時間 */
export function moveCost(grid: Grid, a: GridPoint, b: GridPoint): number {
  return (stepCost(grid, a.x, a.y) + stepCost(grid, b.x, b.y)) / 2;
}

/**
 * target までの到着時間を全マスについて計算する（ダイクストラ法）。
 * 通れないマスと、blockedIndex で指定したマスは Infinity になる。
 */
export function computeDistanceField(grid: Grid, target: GridPoint, blockedIndex = -1): Float64Array {
  const dist = new Float64Array(grid.width * grid.height).fill(Infinity);
  const passable = (x: number, y: number) => isGroundPassable(grid, x, y) && tileIndex(grid, x, y) !== blockedIndex;
  if (!passable(target.x, target.y)) return dist;

  const heap = new MinHeap();
  dist[tileIndex(grid, target.x, target.y)] = 0;
  heap.push(0, target.x, target.y);
  while (heap.size > 0) {
    const [d, x, y] = heap.pop();
    if (d > dist[tileIndex(grid, x, y)]) continue;
    for (const dir of DIRECTIONS) {
      const nx = x + dir.x;
      const ny = y + dir.y;
      if (!inBounds(grid, nx, ny) || !passable(nx, ny)) continue;
      const nd = d + moveCost(grid, { x, y }, { x: nx, y: ny });
      const ni = tileIndex(grid, nx, ny);
      if (nd < dist[ni]) {
        dist[ni] = nd;
        heap.push(nd, nx, ny);
      }
    }
  }
  return dist;
}

/** 距離場に従って、from の次に進むマス。進めなければ null */
export function nextStep(grid: Grid, field: Float64Array, from: GridPoint): GridPoint | null {
  let best: GridPoint | null = null;
  let bestValue = Infinity;
  for (const dir of DIRECTIONS) {
    const nx = from.x + dir.x;
    const ny = from.y + dir.y;
    if (!inBounds(grid, nx, ny)) continue;
    const value = field[tileIndex(grid, nx, ny)] + moveCost(grid, from, { x: nx, y: ny });
    if (value < bestValue) {
      bestValue = value;
      best = { x: nx, y: ny };
    }
  }
  return bestValue === Infinity ? null : best;
}

/** from から距離場をたどって目的地までのマスの列を返す（from を含む）。たどれなければ null */
export function traceRoute(grid: Grid, field: Float64Array, from: GridPoint): GridPoint[] | null {
  if (field[tileIndex(grid, from.x, from.y)] === Infinity) return null;
  const route: GridPoint[] = [from];
  let current = from;
  // 距離場が正しければ必ず目的地に着くが、念のため上限を設ける
  for (let i = 0; i < grid.width * grid.height; i++) {
    if (field[tileIndex(grid, current.x, current.y)] === 0) return route;
    const next = nextStep(grid, field, current);
    if (!next) return null;
    route.push(next);
    current = next;
  }
  return null;
}

/** from から to までの最短ルート（from を含まない）。行けなければ null */
export function findPath(grid: Grid, from: GridPoint, to: GridPoint): GridPoint[] | null {
  const field = computeDistanceField(grid, to);
  const route = traceRoute(grid, field, from);
  return route ? route.slice(1) : null;
}

/** 到着時間の小さい順に取り出せる入れ物 */
class MinHeap {
  private items: [number, number, number][] = [];

  get size(): number {
    return this.items.length;
  }

  push(priority: number, x: number, y: number): void {
    const items = this.items;
    items.push([priority, x, y]);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent][0] <= items[i][0]) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop(): [number, number, number] {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < items.length && items[left][0] < items[smallest][0]) smallest = left;
        if (right < items.length && items[right][0] < items[smallest][0]) smallest = right;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}
