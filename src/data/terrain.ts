// 地形の定義。数値はすべて仮で、遊びながら調整する。

export type TerrainId = 'plain' | 'mountain' | 'forest';

/** 地形カードとして手札に来る地形（草原は「何もない」状態なので含まない） */
export type TerrainCardId = Exclude<TerrainId, 'plain'>;

export interface TerrainDef {
  id: TerrainId;
  name: string;
  /** 色だけに頼らず区別するための1文字 */
  icon: string;
  /** 地上の敵・英雄が通れるか */
  groundPassable: boolean;
  /** この地形の上での地上の移動速度の倍率 */
  speedMultiplier: number;
  /** タワーを建てられるか */
  buildable: boolean;
  /** この地形の上に建てたタワーの射程ボーナス（マス） */
  towerRangeBonus: number;
  description: string;
}

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  plain: {
    id: 'plain',
    name: '草原',
    icon: '',
    groundPassable: true,
    speedMultiplier: 1,
    buildable: true,
    towerRangeBonus: 0,
    description: '何もない土地。タワーを建てられる。',
  },
  mountain: {
    id: 'mountain',
    name: '山',
    icon: '山',
    groundPassable: false,
    speedMultiplier: 1,
    buildable: true,
    towerRangeBonus: 1,
    description: '敵は通れない。山の上に建てたタワーは射程+1。',
  },
  forest: {
    id: 'forest',
    name: '森',
    icon: '森',
    groundPassable: true,
    speedMultiplier: 0.5,
    buildable: false,
    towerRangeBonus: 0,
    description: '敵の動きが半分になる。隣の弓塔は攻撃が速くなる。タワーは建てられない。',
  },
};
