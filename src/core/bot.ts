// 自動で遊ぶプレイヤー（ボット）。難しさの確認（バランス調整）に使う。
// 人間ほど上手くはないが「普通に考えて置く」程度の判断をする。

import type { StageDef } from '../data/stage';
import { TERRAIN } from '../data/terrain';
import { TOWERS, type TowerId } from '../data/towers';
import {
  checkTerrainPlacement,
  checkTowerPlacement,
  createBattle,
  deployHero,
  enemyRoute,
  FIXED_DT,
  moveHero,
  placeTerrain,
  placeTower,
  startCombat,
  step,
  towerRange,
  type BattleState,
} from './battle';
import { distance, tileAt, tileIndex } from './grid';
import { computeDistanceField } from './pathfinding';

export interface BotOptions {
  terrain: boolean;
  towers: boolean;
  hero: boolean;
}

export interface SimulationResult {
  seed: number;
  won: boolean;
  castleHp: number;
  wave: number;
  time: number;
  kills: number;
  towers: number;
  heroDeaths: number;
  routeLength: number;
}

const BUILD_ORDER: TowerId[] = ['arrow', 'arrow', 'fire', 'water', 'arrow', 'fire', 'arrow', 'water', 'fire'];

/** 地形カードを、敵が城に着くまでの時間が一番長くなる場所に置く */
export function botPlaceTerrain(state: BattleState): void {
  const { grid, castle, entrance } = state;
  const entranceIndex = tileIndex(grid, entrance.x, entrance.y);
  while (state.hand.length > 0) {
    let best: { hand: number; x: number; y: number; value: number } | null = null;
    for (let hand = 0; hand < state.hand.length; hand++) {
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          if (!checkTerrainPlacement(state, hand, x, y).ok) continue;
          const tile = tileAt(grid, x, y);
          tile.terrain = state.hand[hand].terrain;
          const value = computeDistanceField(grid, castle)[entranceIndex];
          tile.terrain = 'plain';
          if (value !== Infinity && (!best || value > best.value)) best = { hand, x, y, value };
        }
      }
    }
    if (!best) return;
    placeTerrain(state, best.hand, best.x, best.y);
  }
}

/** お金がある限り、敵の道をたくさん射程に入れられる場所にタワーを建てる */
export function botBuildTowers(state: BattleState): void {
  for (;;) {
    const type = BUILD_ORDER[state.towers.length % BUILD_ORDER.length];
    if (state.gold < TOWERS[type].cost) return;
    const route = enemyRoute(state);
    const onRoute = new Set(route.map((p) => tileIndex(state.grid, p.x, p.y)));
    let best: { x: number; y: number; score: number } | null = null;
    for (let y = 0; y < state.grid.height; y++) {
      for (let x = 0; x < state.grid.width; x++) {
        // 道の上には建てない（道が変わって読みにくくなるため）
        if (onRoute.has(tileIndex(state.grid, x, y))) continue;
        if (!checkTowerPlacement(state, type, x, y).ok) continue;
        const range = towerRange(state, { type, x, y });
        let score = 0;
        for (const p of route) {
          if (distance(p, { x, y }) <= range) score += TERRAIN[tileAt(state.grid, p.x, p.y).terrain].id === 'forest' ? 2 : 1;
        }
        if (!best || score > best.score) best = { x, y, score };
      }
    }
    if (!best || best.score === 0) return;
    placeTower(state, type, best.x, best.y);
  }
}

/** 英雄を出撃させて、敵の道の途中（城寄り）で待ち構えさせる */
export function botHero(state: BattleState): void {
  if (state.hero.status === 'ready') deployHero(state);
  if (state.hero.status !== 'active' || state.hero.path.length > 0) return;
  const route = enemyRoute(state);
  if (route.length === 0) return;
  const spot = route[Math.floor(route.length * 0.6)];
  if (distance(state.hero, spot) > 0.5) moveHero(state, spot.x, spot.y);
}

export function simulate(stage: StageDef, seed: number, options: BotOptions): SimulationResult {
  const state = createBattle(stage, seed);
  if (options.terrain) botPlaceTerrain(state);
  if (options.towers) botBuildTowers(state);
  const routeLength = enemyRoute(state).length;
  startCombat(state);

  let nextThink = 0;
  while ((state.phase === 'combat' || state.phase === 'prep') && state.time < 900) {
    if (state.time >= nextThink) {
      if (options.towers) botBuildTowers(state);
      if (options.hero) botHero(state);
      nextThink = state.time + 1;
    }
    step(state, FIXED_DT);
  }
  return {
    seed,
    won: state.phase === 'won',
    castleHp: state.castleHp,
    wave: state.waveIndex + 1,
    time: Math.round(state.time),
    kills: state.kills,
    towers: state.towers.length,
    heroDeaths: state.hero.deaths,
    routeLength,
  };
}
