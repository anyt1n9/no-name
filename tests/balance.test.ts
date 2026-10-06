// ボットに何度も遊ばせて、難しさがねらい通りか確かめる。
// 数値を調整してこのテストが落ちたら、難しさが大きく変わったというサイン。

import { describe, expect, it } from 'vitest';
import { simulate, type BotOptions } from '../src/core/bot';
import { FIRST_STAGE } from '../src/data/stage';

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

function winRate(options: BotOptions): number {
  return SEEDS.filter((seed) => simulate(FIRST_STAGE, seed, options).won).length / SEEDS.length;
}

// ボットのシミュレーションは時間がかかるので、制限時間を長めにする
describe('難しさ（ステージ1）', { timeout: 60_000 }, () => {
  it('何もしなければ必ず負ける', () => {
    expect(winRate({ terrain: false, towers: false, hero: false })).toBe(0);
  });

  it('タワーだけでは勝ちにくい', () => {
    expect(winRate({ terrain: false, towers: true, hero: false })).toBeLessThanOrEqual(0.5);
  });

  it('地形・タワー・英雄をすべて使えばほぼ勝てる', () => {
    expect(winRate({ terrain: true, towers: true, hero: true })).toBeGreaterThanOrEqual(0.8);
  });
});
