// シード値つきの乱数。同じシード値なら必ず同じ順番で同じ値が出る。
// 状態はただの数値なので、そのままセーブデータに入れられる。

export interface Rng {
  state: number;
}

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** 0以上1未満の数（mulberry32） */
export function nextFloat(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** min以上max以下の整数 */
export function nextInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(nextFloat(rng) * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick: empty list');
  return items[nextInt(rng, 0, items.length - 1)];
}

/** 配列をその場で並べ替えて返す */
export function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
