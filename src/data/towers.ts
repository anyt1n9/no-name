// タワーの定義。数値はすべて仮で、遊びながら調整する。

import type { TerrainId } from './terrain';

export type TowerId = 'arrow' | 'fire' | 'water';

export type Element = 'none' | 'fire' | 'water' | 'wind' | 'thunder' | 'poison' | 'light' | 'dark';

export interface TowerDef {
  id: TowerId;
  name: string;
  /** 色だけに頼らず区別するための1文字 */
  icon: string;
  element: Element;
  cost: number;
  /** 射程（マス） */
  range: number;
  damage: number;
  /** 攻撃の間隔（秒） */
  interval: number;
  /** 範囲攻撃の半径（マス）。0なら単体攻撃 */
  splashRadius: number;
  /** 当てた敵を遅くする効果 */
  slow: { multiplier: number; duration: number } | null;
  /** 飛行する敵を攻撃できるか */
  canHitAir: boolean;
  /** 隣（上下左右と斜め）に特定の地形があると攻撃が速くなる */
  adjacentBonus: { terrain: TerrainId; intervalMultiplier: number } | null;
  color: number;
  description: string;
}

export const TOWERS: Record<TowerId, TowerDef> = {
  arrow: {
    id: 'arrow',
    name: '弓塔',
    icon: '弓',
    element: 'none',
    cost: 50,
    range: 3,
    damage: 9,
    interval: 0.7,
    splashRadius: 0,
    slow: null,
    canHitAir: true,
    adjacentBonus: { terrain: 'forest', intervalMultiplier: 0.75 },
    color: 0xc8a165,
    description: '安くて射程が長い。飛行する敵も撃てる。森の隣だと攻撃が速くなる。',
  },
  fire: {
    id: 'fire',
    name: '火の塔',
    icon: '火',
    element: 'fire',
    cost: 80,
    range: 2.5,
    damage: 12,
    interval: 1.4,
    splashRadius: 1,
    slow: null,
    canHitAir: false,
    adjacentBonus: null,
    color: 0xe0603a,
    description: '着弾点のまわりの敵をまとめて攻撃する。',
  },
  water: {
    id: 'water',
    name: '水の塔',
    icon: '水',
    element: 'water',
    cost: 60,
    range: 2.5,
    damage: 4,
    interval: 1,
    splashRadius: 0,
    slow: { multiplier: 0.5, duration: 1.5 },
    canHitAir: false,
    adjacentBonus: null,
    color: 0x4a90d9,
    description: '当てた敵の動きを1.5秒間半分にする。',
  },
};

export const TOWER_ORDER: TowerId[] = ['arrow', 'fire', 'water'];
