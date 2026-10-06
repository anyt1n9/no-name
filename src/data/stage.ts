// ステージの定義。数値はすべて仮で、遊びながら調整する。

import type { EnemyId } from './enemies';
import type { TerrainCardId } from './terrain';

export interface WaveGroup {
  enemy: EnemyId;
  count: number;
  /** 1体ずつ出てくる間隔（秒） */
  interval: number;
  /** ウェーブ開始からこのグループが出始めるまでの時間（秒） */
  delay: number;
}

export interface WaveDef {
  groups: WaveGroup[];
  /** このウェーブの敵のHP倍率 */
  hpMultiplier: number;
}

export interface StageDef {
  name: string;
  width: number;
  height: number;
  startGold: number;
  castleHp: number;
  /** 準備フェーズで引く地形カードの枚数 */
  handSize: number;
  starterDeck: TerrainCardId[];
  /** 最初からマップに置かれている地形の数 */
  preplaced: Record<TerrainCardId, number>;
  waves: WaveDef[];
  /** 敵が残っていても、最後の出現からこの秒数で次のウェーブが来る */
  waveGapMax: number;
  /** 敵を全滅させたとき、次のウェーブまでの秒数 */
  waveGapCleared: number;
}

export const FIRST_STAGE: StageDef = {
  name: '第1章 ステージ1',
  width: 15,
  height: 11,
  startGold: 150,
  castleHp: 20,
  handSize: 5,
  starterDeck: ['mountain', 'mountain', 'mountain', 'mountain', 'mountain', 'mountain', 'forest', 'forest', 'forest', 'forest'],
  preplaced: { mountain: 10, forest: 6 },
  waves: [
    { hpMultiplier: 1.6, groups: [{ enemy: 'goblin', count: 6, interval: 1.4, delay: 0 }] },
    {
      hpMultiplier: 1.75,
      groups: [
        { enemy: 'goblin', count: 8, interval: 1.1, delay: 0 },
        { enemy: 'wolf', count: 4, interval: 1, delay: 4 },
      ],
    },
    { hpMultiplier: 1.9, groups: [{ enemy: 'wolf', count: 12, interval: 0.7, delay: 0 }] },
    {
      hpMultiplier: 2.15,
      groups: [
        { enemy: 'goblin', count: 14, interval: 0.8, delay: 0 },
        { enemy: 'wolf', count: 8, interval: 0.9, delay: 3 },
      ],
    },
    {
      hpMultiplier: 2.4,
      groups: [
        { enemy: 'goblin', count: 18, interval: 0.6, delay: 0 },
        { enemy: 'wolf', count: 14, interval: 0.6, delay: 2 },
      ],
    },
  ],
  waveGapMax: 15,
  waveGapCleared: 3,
};
