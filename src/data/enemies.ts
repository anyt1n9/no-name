// 敵の定義。数値はすべて仮で、遊びながら調整する。

import type { IconId } from './icons';

export type EnemyId = 'goblin' | 'wolf';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  /** 色だけに頼らず形でも区別するためのアイコン */
  icon: IconId;
  hp: number;
  /** 移動速度（マス/秒） */
  speed: number;
  /** 倒したときにもらえるお金 */
  reward: number;
  /** 城に着いたときに減らす城HP */
  castleDamage: number;
  /** 英雄への攻撃 */
  attackDamage: number;
  attackInterval: number;
  flying: boolean;
  /** 見た目の大きさ（マス） */
  radius: number;
  color: number;
  description: string;
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  goblin: {
    id: 'goblin',
    name: 'ゴブリン',
    icon: 'goblin',
    hp: 40,
    speed: 1,
    reward: 6,
    castleDamage: 1,
    attackDamage: 5,
    attackInterval: 1,
    flying: false,
    radius: 0.28,
    color: 0xd2763e,
    description: 'ふつうの魔物。',
  },
  wolf: {
    id: 'wolf',
    name: '魔狼',
    icon: 'wolf',
    hp: 26,
    speed: 1.8,
    reward: 5,
    castleDamage: 1,
    attackDamage: 4,
    attackInterval: 0.8,
    flying: false,
    radius: 0.26,
    color: 0xa8405e,
    description: '足が速いが体力は低い。',
  },
};
