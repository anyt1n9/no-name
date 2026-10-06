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

/** マップの地形の作り方。[最小, 最大] の範囲でランダムに決まる */
export interface MapStyle {
  /** 山脈（すき間のある山の列）の数 */
  ridges: [number, number];
  /** 湖の数 */
  lakes: [number, number];
  /** 森のかたまりの数 */
  groves: [number, number];
  /** ぽつんと立つ岩山の数 */
  rocks: [number, number];
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
  /** 最初からマップにある地形の作り方 */
  map: MapStyle;
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
  map: { ridges: [1, 2], lakes: [0, 1], groves: [2, 3], rocks: [2, 4] },
  waves: [
    { hpMultiplier: 1.85, groups: [{ enemy: 'goblin', count: 6, interval: 1.4, delay: 0 }] },
    {
      hpMultiplier: 2,
      groups: [
        { enemy: 'goblin', count: 8, interval: 1.1, delay: 0 },
        { enemy: 'wolf', count: 4, interval: 1, delay: 4 },
      ],
    },
    { hpMultiplier: 2.2, groups: [{ enemy: 'wolf', count: 12, interval: 0.7, delay: 0 }] },
    {
      hpMultiplier: 2.45,
      groups: [
        { enemy: 'goblin', count: 14, interval: 0.8, delay: 0 },
        { enemy: 'wolf', count: 8, interval: 0.9, delay: 3 },
      ],
    },
    {
      hpMultiplier: 2.75,
      groups: [
        { enemy: 'goblin', count: 18, interval: 0.6, delay: 0 },
        { enemy: 'wolf', count: 14, interval: 0.6, delay: 2 },
      ],
    },
  ],
  waveGapMax: 15,
  waveGapCleared: 3,
};
