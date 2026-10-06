// 英雄の役職の定義。数値はすべて仮で、遊びながら調整する。

export type HeroJobId = 'swordsman';

export interface HeroJobDef {
  id: HeroJobId;
  name: string;
  /** 色だけに頼らず区別するための1文字 */
  icon: string;
  hp: number;
  damage: number;
  /** 攻撃の間隔（秒） */
  interval: number;
  /** 攻撃が届く距離（マス） */
  range: number;
  /** 移動速度（マス/秒） */
  speed: number;
  /** 同時に足止めできる敵の数 */
  blockCount: number;
  /** 倒れてから再び出撃できるまでの時間（秒） */
  respawnTime: number;
  /** 戦っていないときの毎秒の回復量 */
  regenPerSecond: number;
  color: number;
  description: string;
}

export const HERO_JOBS: Record<HeroJobId, HeroJobDef> = {
  swordsman: {
    id: 'swordsman',
    name: '剣士',
    icon: '剣',
    hp: 220,
    damage: 14,
    interval: 0.8,
    range: 1,
    speed: 2.2,
    blockCount: 2,
    respawnTime: 15,
    regenPerSecond: 6,
    color: 0x3d7be0,
    description: '敵の前に立って足止めする。同時に2体まで止められる。',
  },
};

/** 英雄の名前の候補（実在の人物・既存作品のキャラクターとは無関係の一般的な名前） */
export const HERO_NAMES: string[] = ['アルフ', 'ベルン', 'カイル', 'ダリオ', 'エリク', 'フィン', 'ガレス', 'ハロルド'];
