import { describe, expect, it } from 'vitest';
import { createRng, nextFloat, nextInt, shuffle } from '../src/core/rng';

describe('シード値つき乱数', () => {
  it('同じシード値なら同じ並びになる', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 10 }, () => nextFloat(a));
    const seqB = Array.from({ length: 10 }, () => nextFloat(b));
    expect(seqA).toEqual(seqB);
  });

  it('違うシード値なら違う並びになる', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(nextFloat(a)).not.toEqual(nextFloat(b));
  });

  it('nextInt は min 以上 max 以下に収まる', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const value = nextInt(rng, 3, 6);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(6);
    }
  });

  it('shuffle は要素を失わない', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = shuffle(createRng(3), [...items]);
    expect([...shuffled].sort()).toEqual(items);
  });
});
