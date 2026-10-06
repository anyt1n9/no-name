// 英雄の役職の定義。数値はすべて仮で、遊びながら調整する。

import type { IconId } from './icons';

export type HeroJobId = 'swordsman' | 'archer' | 'mage';

export interface HeroJobDef {
  id: HeroJobId;
  name: string;
  icon: IconId;
  hp: number;
  damage: number;
  /** 攻撃の間隔（秒） */
  interval: number;
  /** 攻撃が届く距離（マス） */
  range: number;
  /** 範囲攻撃の半径（マス）。0なら単体攻撃 */
  splashRadius: number;
  /** 飛行する敵を攻撃できるか */
  canHitAir: boolean;
  /** 移動速度（マス/秒） */
  speed: number;
  /** 同時に足止めできる敵の数。0なら足止めせず、敵にも狙われない */
  blockCount: number;
  /** 倒れてから再び出撃できるまでの時間（秒） */
  respawnTime: number;
  /** 戦っていないときの毎秒の回復量 */
  regenPerSecond: number;
  description: string;
}

export const HERO_JOBS: Record<HeroJobId, HeroJobDef> = {
  swordsman: {
    id: 'swordsman',
    name: '剣士',
    icon: 'sword',
    hp: 220,
    damage: 14,
    interval: 0.8,
    range: 1,
    splashRadius: 0,
    canHitAir: false,
    speed: 2.2,
    blockCount: 2,
    respawnTime: 15,
    regenPerSecond: 6,
    description: '敵の前に立って足止めする。同時に2体まで止められる。',
  },
  archer: {
    id: 'archer',
    name: '弓兵',
    icon: 'bow',
    hp: 140,
    damage: 9,
    interval: 0.9,
    range: 3,
    splashRadius: 0,
    canHitAir: true,
    speed: 2.4,
    blockCount: 0,
    respawnTime: 15,
    regenPerSecond: 6,
    description: '後ろから矢で攻撃する。足止めはしないので、敵には狙われない。',
  },
  mage: {
    id: 'mage',
    name: '魔法使い',
    icon: 'staff',
    hp: 120,
    damage: 13,
    interval: 1.7,
    range: 2.5,
    splashRadius: 1,
    canHitAir: false,
    speed: 2,
    blockCount: 0,
    respawnTime: 15,
    regenPerSecond: 6,
    description: '敵が固まっているところへ範囲魔法を撃つ。足止めはしないので、敵には狙われない。',
  },
};

/** 冒険に連れて行く英雄（v0.1 では固定。王国の酒場ができたら選べるようにする） */
export const STARTING_PARTY: HeroJobId[] = ['swordsman', 'archer', 'mage'];

/** 英雄の名前の候補（実在の人物・既存作品のキャラクターとは無関係の一般的な名前） */
export const HERO_NAMES: string[] = ['アルフ', 'ベルン', 'カイル', 'ダリオ', 'エリク', 'フィン', 'ガレス', 'ハロルド', 'イリス', 'ジーナ', 'ミラ', 'ノエル'];
