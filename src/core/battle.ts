// 1ステージ分の防衛戦のルール。画面（Phaser）には一切依存しないので、テストやシミュレーションでそのまま動かせる。

import { ENEMIES, type EnemyId } from '../data/enemies';
import { HERO_JOBS, HERO_NAMES, STARTING_PARTY, type HeroJobId } from '../data/heroes';
import type { StageDef } from '../data/stage';
import { TERRAIN, type TerrainCardId } from '../data/terrain';
import { TOWERS, type TowerId } from '../data/towers';
import {
  distance,
  inBounds,
  isGroundPassable,
  samePoint,
  stepCost,
  tileAt,
  tileIndex,
  tileOf,
  type Grid,
  type GridPoint,
} from './grid';
import { generateMap } from './mapgen';
import { computeDistanceField, findPath, nextStep, traceRoute } from './pathfinding';
import { createRng, shuffle, type Rng } from './rng';

/** ルールを1回進める時間（秒）。画面側もテストもこの刻みで step を呼ぶ */
export const FIXED_DT = 1 / 60;

/** 英雄にこの距離まで近づいた敵は足止めされる（マス） */
const ENGAGE_RADIUS = 0.6;
/** 足止め中の敵と英雄がこの距離より離れると足止めが解ける（マス） */
const RELEASE_RADIUS = 0.9;
/** 足止めしない英雄（弓兵・魔法使い）は、この距離まで近づいた敵に通りすがりに攻撃される（マス） */
const PASSING_ATTACK_RADIUS = 1.5;
/** 英雄はこの秒数のあいだ攻撃を受けなければ、体力が回復し始める */
const REGEN_DELAY = 2;
/** 撤退した英雄が、もう一度出撃できるようになるまでの秒数 */
export const RETREAT_TIME = 5;

export type Phase = 'prep' | 'combat' | 'won' | 'lost';

export interface TerrainCard {
  uid: number;
  terrain: TerrainCardId;
}

export interface Tower {
  uid: number;
  type: TowerId;
  x: number;
  y: number;
  /** 次に攻撃できるまでの秒数 */
  cooldown: number;
}

export interface Enemy {
  uid: number;
  type: EnemyId;
  x: number;
  y: number;
  /** 最後に到着したマス */
  tile: GridPoint;
  /** いま向かっているマス */
  target: GridPoint;
  hp: number;
  maxHp: number;
  slowTimer: number;
  slowMultiplier: number;
  /** 英雄に足止めされているか */
  engaged: boolean;
  attackCooldown: number;
  dead: boolean;
}

/** ready：出撃できる／active：戦場にいる／down：倒れて復活待ち／resting：撤退して休憩中 */
export type HeroStatus = 'ready' | 'active' | 'down' | 'resting';

export interface Hero {
  uid: number;
  name: string;
  job: HeroJobId;
  status: HeroStatus;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** 再び出撃できるまでの秒数 */
  respawnLeft: number;
  /** これから進むマスの列 */
  path: GridPoint[];
  attackCooldown: number;
  /** 最後に攻撃を受けた時刻（回復を始めるかどうかの判断に使う） */
  lastHitAt: number;
  deaths: number;
}

/** 英雄の死亡記録。後の版で「魂の欠片」（墓・亡霊）の元になる */
export interface DeathRecord {
  heroName: string;
  job: HeroJobId;
  stageName: string;
  wave: number;
  killedBy: EnemyId;
  time: number;
}

/** 画面側に演出を伝えるための出来事 */
export type BattleEvent =
  | { type: 'shot'; tower: TowerId; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'enemyKilled'; x: number; y: number; reward: number }
  | { type: 'castleHit'; damage: number }
  | { type: 'heroStrike'; job: HeroJobId; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'splash'; x: number; y: number; radius: number }
  | { type: 'heroDown'; heroUid: number; x: number; y: number }
  | { type: 'heroRetreat'; heroUid: number; x: number; y: number }
  | { type: 'heroHit'; heroUid: number; x: number; y: number }
  | { type: 'waveStart'; wave: number };

interface SpawnEntry {
  time: number;
  enemy: EnemyId;
}

export interface BattleState {
  stage: StageDef;
  seed: number;
  rng: Rng;
  grid: Grid;
  entrance: GridPoint;
  castle: GridPoint;
  /** 城までの到着時間の表。地形やタワーが変わるたびに作り直す */
  field: Float64Array;
  phase: Phase;
  time: number;
  gold: number;
  castleHp: number;
  deck: TerrainCard[];
  hand: TerrainCard[];
  towers: Tower[];
  enemies: Enemy[];
  /** 冒険に連れてきた英雄（戦場に出せるのは同時に1人まで） */
  heroes: Hero[];
  /** いまのウェーブ（0始まり）。戦闘開始前は -1 */
  waveIndex: number;
  waveTime: number;
  spawnQueue: SpawnEntry[];
  /** 次のウェーブまでの秒数。数え始めていなければ null */
  nextWaveIn: number | null;
  nextUid: number;
  events: BattleEvent[];
  deathLog: DeathRecord[];
  kills: number;
}

export type CommandResult = { ok: true } | { ok: false; reason: string };

const OK: CommandResult = { ok: true };
const fail = (reason: string): CommandResult => ({ ok: false, reason });

export function createBattle(stage: StageDef, seed: number, party: HeroJobId[] = STARTING_PARTY): BattleState {
  const rng = createRng(seed);
  const { grid, entrance, castle } = generateMap(stage, rng);
  let nextUid = 1;
  const deck = shuffle(
    rng,
    stage.starterDeck.map((terrain) => ({ uid: nextUid++, terrain })),
  );
  const hand = deck.splice(0, stage.handSize);
  const names = shuffle(rng, [...HERO_NAMES]);
  const heroes: Hero[] = party.map((job, i) => ({
    uid: nextUid++,
    name: names[i % names.length],
    job,
    status: 'ready',
    x: castle.x,
    y: castle.y,
    hp: HERO_JOBS[job].hp,
    maxHp: HERO_JOBS[job].hp,
    respawnLeft: 0,
    path: [],
    attackCooldown: 0,
    lastHitAt: -Infinity,
    deaths: 0,
  }));
  return {
    stage,
    seed,
    rng,
    grid,
    entrance,
    castle,
    field: computeDistanceField(grid, castle),
    phase: 'prep',
    time: 0,
    gold: stage.startGold,
    castleHp: stage.castleHp,
    deck,
    hand,
    towers: [],
    enemies: [],
    heroes,
    waveIndex: -1,
    waveTime: 0,
    spawnQueue: [],
    nextWaveIn: null,
    nextUid,
    events: [],
    deathLog: [],
    kills: 0,
  };
}

// ---------------------------------------------------------------------------
// プレイヤーの操作
// ---------------------------------------------------------------------------

export function checkTerrainPlacement(state: BattleState, handIndex: number, x: number, y: number): CommandResult {
  if (state.phase !== 'prep') return fail('地形は準備フェーズにしか置けません');
  const card = state.hand[handIndex];
  if (!card) return fail('地形カードを選んでください');
  if (!inBounds(state.grid, x, y)) return fail('マップの外です');
  if (isReserved(state, x, y)) return fail('敵の城と味方の城には置けません');
  const tile = tileAt(state.grid, x, y);
  if (tile.terrain !== 'plain') return fail('すでに地形があります');
  if (tile.towerUid !== null) return fail('タワーがあるマスには置けません');
  if (!TERRAIN[card.terrain].groundPassable) {
    const blocked = checkStillReachable(state, x, y);
    if (!blocked.ok) return blocked;
  }
  return OK;
}

export function placeTerrain(state: BattleState, handIndex: number, x: number, y: number): CommandResult {
  const result = checkTerrainPlacement(state, handIndex, x, y);
  if (!result.ok) return result;
  const [card] = state.hand.splice(handIndex, 1);
  tileAt(state.grid, x, y).terrain = card.terrain;
  onGridChanged(state);
  return OK;
}

export function checkTowerPlacement(state: BattleState, towerId: TowerId, x: number, y: number): CommandResult {
  if (state.phase !== 'prep' && state.phase !== 'combat') return fail('いまは建てられません');
  if (!inBounds(state.grid, x, y)) return fail('マップの外です');
  if (isReserved(state, x, y)) return fail('敵の城と味方の城には建てられません');
  const tile = tileAt(state.grid, x, y);
  if (tile.towerUid !== null) return fail('すでにタワーがあります');
  const terrain = TERRAIN[tile.terrain];
  if (!terrain.buildable) return fail(`${terrain.name}には建てられません`);
  if (state.gold < TOWERS[towerId].cost) return fail('お金が足りません');
  const hero = activeHero(state);
  if (hero && samePoint(tileOf(hero), { x, y })) return fail('英雄がいる場所には建てられません');
  // 敵のルートを変えられるのは地形カードだけにするため、ルートの上には建てさせない
  if (enemyRoute(state).some((p) => p.x === x && p.y === y)) {
    return fail('敵の通り道には建てられません（道は地形カードで変えられます）');
  }
  // 念のため、敵がたどり着けなくならないかも確かめる
  if (terrain.groundPassable) {
    const blocked = checkStillReachable(state, x, y);
    if (!blocked.ok) return blocked;
  }
  return OK;
}

export function placeTower(state: BattleState, towerId: TowerId, x: number, y: number): CommandResult {
  const result = checkTowerPlacement(state, towerId, x, y);
  if (!result.ok) return result;
  const tower: Tower = { uid: state.nextUid++, type: towerId, x, y, cooldown: 0 };
  state.towers.push(tower);
  state.gold -= TOWERS[towerId].cost;
  tileAt(state.grid, x, y).towerUid = tower.uid;
  onGridChanged(state);
  return OK;
}

export function startCombat(state: BattleState): CommandResult {
  if (state.phase !== 'prep') return fail('すでに戦闘中です');
  state.phase = 'combat';
  startWave(state, 0);
  return OK;
}

/** いま戦場に出ている英雄（いなければ null） */
export function activeHero(state: BattleState): Hero | null {
  return state.heroes.find((h) => h.status === 'active') ?? null;
}

export function deployHero(state: BattleState, heroUid: number): CommandResult {
  const hero = state.heroes.find((h) => h.uid === heroUid);
  if (!hero) return fail('その英雄はいません');
  if (state.phase !== 'prep' && state.phase !== 'combat') return fail('いまは出撃できません');
  if (hero.status === 'active') return fail('すでに出撃しています');
  if (hero.status === 'down') return fail(`${hero.name}は復活まであと${Math.ceil(hero.respawnLeft)}秒です`);
  if (hero.status === 'resting') return fail(`${hero.name}は休憩中です（あと${Math.ceil(hero.respawnLeft)}秒）`);
  const other = activeHero(state);
  if (other) return fail(`同時に出撃できるのは1人です（${other.name}を撤退させるか、倒れたら交代できます）`);
  hero.status = 'active';
  hero.x = state.castle.x;
  hero.y = state.castle.y;
  hero.hp = hero.maxHp;
  hero.path = [];
  hero.attackCooldown = 0;
  return OK;
}

/** 出撃中の英雄を城へ戻す。死亡にはならず、少し休んだらまた出撃できる */
export function retreatHero(state: BattleState): CommandResult {
  const hero = activeHero(state);
  if (!hero) return fail('出撃中の英雄がいません');
  hero.status = 'resting';
  hero.respawnLeft = RETREAT_TIME;
  hero.path = [];
  for (const enemy of state.enemies) enemy.engaged = false;
  state.events.push({ type: 'heroRetreat', heroUid: hero.uid, x: hero.x, y: hero.y });
  return OK;
}

export function moveHero(state: BattleState, x: number, y: number): CommandResult {
  const hero = activeHero(state);
  if (!hero) return fail('英雄が出撃していません');
  if (!isGroundPassable(state.grid, x, y)) return fail('そこへは移動できません');
  const path = findPath(state.grid, tileOf(hero), { x, y });
  if (!path) return fail('そこへは行けません');
  hero.path = path;
  return OK;
}

// ---------------------------------------------------------------------------
// 時間を進める
// ---------------------------------------------------------------------------

export function step(state: BattleState, dt: number = FIXED_DT): void {
  if (state.phase === 'won' || state.phase === 'lost') return;
  state.time += dt;
  updateHeroTimers(state, dt);
  updateHeroMovement(state, dt);
  if (state.phase !== 'combat') return;

  updateWaves(state, dt);
  updateEnemies(state, dt);
  if (state.phase !== 'combat') return;
  updateTowers(state, dt);
  updateHeroAttack(state, dt);
  state.enemies = state.enemies.filter((e) => !e.dead);

  const lastWave = state.waveIndex === state.stage.waves.length - 1;
  if (lastWave && state.spawnQueue.length === 0 && state.enemies.length === 0) state.phase = 'won';
}

export function drainEvents(state: BattleState): BattleEvent[] {
  const events = state.events;
  state.events = [];
  return events;
}

/** 敵の城（entrance）から味方の城（castle）まで、いま敵が通るルート */
export function enemyRoute(state: BattleState): GridPoint[] {
  return traceRoute(state.grid, state.field, state.entrance) ?? [];
}

/** (x, y) に地形やタワーを置いたら敵のルートがどうなるか（実際には置かない） */
export function previewRoute(
  state: BattleState,
  x: number,
  y: number,
  change: { terrain: TerrainCardId } | { tower: true },
): GridPoint[] {
  const tile = tileAt(state.grid, x, y);
  const saved = { terrain: tile.terrain, towerUid: tile.towerUid };
  if ('terrain' in change) tile.terrain = change.terrain;
  else tile.towerUid = -1;
  const field = computeDistanceField(state.grid, state.castle);
  tile.terrain = saved.terrain;
  tile.towerUid = saved.towerUid;
  return traceRoute(state.grid, field, state.entrance) ?? [];
}

/** タワーの実際の攻撃間隔（隣の地形によるボーナス込み） */
export function towerInterval(state: BattleState, tower: Tower): number {
  const def = TOWERS[tower.type];
  if (def.adjacentBonus && hasAdjacentTerrain(state.grid, tower, def.adjacentBonus.terrain)) {
    return def.interval * def.adjacentBonus.intervalMultiplier;
  }
  return def.interval;
}

/** タワーの実際の射程（下の地形によるボーナス込み） */
export function towerRange(state: BattleState, tower: Pick<Tower, 'type' | 'x' | 'y'>): number {
  return TOWERS[tower.type].range + TERRAIN[tileAt(state.grid, tower.x, tower.y).terrain].towerRangeBonus;
}

// ---------------------------------------------------------------------------
// 内部の処理
// ---------------------------------------------------------------------------

function isReserved(state: BattleState, x: number, y: number): boolean {
  const point = { x, y };
  return samePoint(point, state.entrance) || samePoint(point, state.castle);
}

/** (x, y) を通れなくしても、敵の城と今いる敵から味方の城へたどり着けるか */
function checkStillReachable(state: BattleState, x: number, y: number): CommandResult {
  const point = { x, y };
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    if (samePoint(tileOf(enemy), point) || samePoint(enemy.target, point)) return fail('敵がいる場所には置けません');
  }
  const field = computeDistanceField(state.grid, state.castle, tileIndex(state.grid, x, y));
  if (field[tileIndex(state.grid, state.entrance.x, state.entrance.y)] === Infinity) {
    return fail('道を完全に塞ぐことはできません');
  }
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    if (field[tileIndex(state.grid, enemy.target.x, enemy.target.y)] === Infinity) {
      return fail('敵の通り道がなくなってしまいます');
    }
  }
  return OK;
}

function onGridChanged(state: BattleState): void {
  state.field = computeDistanceField(state.grid, state.castle);
  const hero = activeHero(state);
  if (hero && hero.path.length > 0 && hero.path.some((p) => !isGroundPassable(state.grid, p.x, p.y))) {
    const destination = hero.path[hero.path.length - 1];
    hero.path = findPath(state.grid, tileOf(hero), destination) ?? [];
  }
}

function hasAdjacentTerrain(grid: Grid, point: GridPoint, terrain: string): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = point.x + dx;
      const y = point.y + dy;
      if (inBounds(grid, x, y) && tileAt(grid, x, y).terrain === terrain) return true;
    }
  }
  return false;
}

function startWave(state: BattleState, index: number): void {
  state.waveIndex = index;
  state.waveTime = 0;
  state.nextWaveIn = null;
  const queue: SpawnEntry[] = [];
  for (const group of state.stage.waves[index].groups) {
    for (let i = 0; i < group.count; i++) queue.push({ time: group.delay + i * group.interval, enemy: group.enemy });
  }
  queue.sort((a, b) => a.time - b.time);
  state.spawnQueue = queue;
  state.events.push({ type: 'waveStart', wave: index + 1 });
}

function updateWaves(state: BattleState, dt: number): void {
  state.waveTime += dt;
  while (state.spawnQueue.length > 0 && state.spawnQueue[0].time <= state.waveTime) {
    spawnEnemy(state, state.spawnQueue.shift()!.enemy);
  }
  if (state.spawnQueue.length > 0) return;
  if (state.waveIndex >= state.stage.waves.length - 1) {
    state.nextWaveIn = null;
    return;
  }
  if (state.nextWaveIn === null) state.nextWaveIn = state.stage.waveGapMax;
  if (!state.enemies.some((e) => !e.dead)) state.nextWaveIn = Math.min(state.nextWaveIn, state.stage.waveGapCleared);
  state.nextWaveIn -= dt;
  if (state.nextWaveIn <= 0) startWave(state, state.waveIndex + 1);
}

function spawnEnemy(state: BattleState, type: EnemyId): void {
  const def = ENEMIES[type];
  const hp = Math.round(def.hp * state.stage.waves[state.waveIndex].hpMultiplier);
  const start = state.entrance;
  state.enemies.push({
    uid: state.nextUid++,
    type,
    x: start.x,
    y: start.y,
    tile: { ...start },
    target: nextStep(state.grid, state.field, start) ?? { ...start },
    hp,
    maxHp: hp,
    slowTimer: 0,
    slowMultiplier: 1,
    engaged: false,
    attackCooldown: 0,
    dead: false,
  });
}

function updateEnemies(state: BattleState, dt: number): void {
  const hero = activeHero(state);
  const blockCount = hero ? HERO_JOBS[hero.job].blockCount : 0;
  let engagedCount = state.enemies.filter((e) => e.engaged && !e.dead).length;

  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    const def = ENEMIES[enemy.type];

    if (enemy.slowTimer > 0) {
      enemy.slowTimer -= dt;
      if (enemy.slowTimer <= 0) enemy.slowMultiplier = 1;
    }

    if (enemy.engaged && (!hero || hero.status !== 'active' || distance(hero, enemy) > RELEASE_RADIUS)) {
      enemy.engaged = false;
      engagedCount--;
    }
    if (
      !enemy.engaged &&
      hero &&
      hero.status === 'active' &&
      !def.flying &&
      engagedCount < blockCount &&
      distance(hero, enemy) <= ENGAGE_RADIUS
    ) {
      enemy.engaged = true;
      engagedCount++;
      enemy.attackCooldown = def.attackInterval / 2;
    }

    if (enemy.engaged && hero) {
      enemy.attackCooldown -= dt;
      if (enemy.attackCooldown <= 0) {
        enemy.attackCooldown += def.attackInterval;
        if (hitHero(state, hero, enemy)) engagedCount = 0;
      }
      continue;
    }

    // 足止めしない英雄には、近くを通りながら攻撃する（歩くのはやめない）
    if (hero && hero.status === 'active' && blockCount === 0 && !def.flying && distance(hero, enemy) <= PASSING_ATTACK_RADIUS) {
      enemy.attackCooldown -= dt;
      if (enemy.attackCooldown <= 0) {
        enemy.attackCooldown += def.attackInterval;
        hitHero(state, hero, enemy);
      }
    } else {
      enemy.attackCooldown = def.attackInterval / 2;
    }

    moveEnemy(state, enemy, dt);
    if (state.phase !== 'combat') return;
  }
}

/** 敵が英雄を1回攻撃する。英雄が倒れたら true */
function hitHero(state: BattleState, hero: Hero, enemy: Enemy): boolean {
  hero.hp -= ENEMIES[enemy.type].attackDamage;
  hero.lastHitAt = state.time;
  state.events.push({ type: 'heroHit', heroUid: hero.uid, x: hero.x, y: hero.y });
  if (hero.hp > 0) return false;
  heroDown(state, hero, enemy.type);
  return true;
}

function moveEnemy(state: BattleState, enemy: Enemy, dt: number): void {
  const def = ENEMIES[enemy.type];
  const under = tileOf(enemy);
  const terrainSpeed = def.flying ? 1 : TERRAIN[tileAt(state.grid, under.x, under.y).terrain].speedMultiplier;
  let remaining = def.speed * enemy.slowMultiplier * terrainSpeed * dt;

  for (let guard = 0; remaining > 0 && guard < 4; guard++) {
    const d = distance(enemy, enemy.target);
    if (d > remaining) {
      enemy.x += ((enemy.target.x - enemy.x) / d) * remaining;
      enemy.y += ((enemy.target.y - enemy.y) / d) * remaining;
      return;
    }
    enemy.x = enemy.target.x;
    enemy.y = enemy.target.y;
    enemy.tile = { ...enemy.target };
    remaining -= d;
    if (samePoint(enemy.tile, state.castle)) {
      reachCastle(state, enemy);
      return;
    }
    const next = nextStep(state.grid, state.field, enemy.tile);
    if (!next) return;
    enemy.target = next;
  }
}

function reachCastle(state: BattleState, enemy: Enemy): void {
  const damage = ENEMIES[enemy.type].castleDamage;
  enemy.dead = true;
  state.castleHp = Math.max(0, state.castleHp - damage);
  state.events.push({ type: 'castleHit', damage });
  if (state.castleHp <= 0) state.phase = 'lost';
}

/** 城まであとどれくらいかかるか（小さいほど城に近い） */
function remainingDistance(state: BattleState, enemy: Enemy): number {
  const target = enemy.target;
  return state.field[tileIndex(state.grid, target.x, target.y)] + distance(enemy, target) * stepCost(state.grid, target.x, target.y);
}

function updateTowers(state: BattleState, dt: number): void {
  for (const tower of state.towers) {
    tower.cooldown -= dt;
    if (tower.cooldown > 0) continue;
    const def = TOWERS[tower.type];
    const range = towerRange(state, tower);

    let target: Enemy | null = null;
    let best = Infinity;
    for (const enemy of state.enemies) {
      if (enemy.dead || (ENEMIES[enemy.type].flying && !def.canHitAir)) continue;
      if (distance(tower, enemy) > range) continue;
      const remaining = remainingDistance(state, enemy);
      if (remaining < best) {
        best = remaining;
        target = enemy;
      }
    }
    if (!target) {
      tower.cooldown = 0;
      continue;
    }

    tower.cooldown += towerInterval(state, tower);
    const hits =
      def.splashRadius > 0
        ? state.enemies.filter((e) => !e.dead && distance(e, target) <= def.splashRadius)
        : [target];
    state.events.push({ type: 'shot', tower: tower.type, fromX: tower.x, fromY: tower.y, toX: target.x, toY: target.y });
    if (def.splashRadius > 0) state.events.push({ type: 'splash', x: target.x, y: target.y, radius: def.splashRadius });
    for (const enemy of hits) {
      if (def.slow) {
        enemy.slowMultiplier = Math.min(enemy.slowMultiplier, def.slow.multiplier);
        enemy.slowTimer = Math.max(enemy.slowTimer, def.slow.duration);
      }
      damageEnemy(state, enemy, def.damage);
    }
  }
}

function damageEnemy(state: BattleState, enemy: Enemy, amount: number): void {
  if (enemy.dead) return;
  enemy.hp -= amount;
  if (enemy.hp <= 0) {
    enemy.dead = true;
    enemy.engaged = false;
    const reward = ENEMIES[enemy.type].reward;
    state.gold += reward;
    state.kills++;
    state.events.push({ type: 'enemyKilled', x: enemy.x, y: enemy.y, reward });
  }
}

function updateHeroTimers(state: BattleState, dt: number): void {
  for (const hero of state.heroes) {
    if (hero.status !== 'down' && hero.status !== 'resting') continue;
    hero.respawnLeft -= dt;
    if (hero.respawnLeft <= 0) {
      hero.respawnLeft = 0;
      hero.status = 'ready';
      hero.hp = hero.maxHp;
    }
  }
}

function updateHeroMovement(state: BattleState, dt: number): void {
  const hero = activeHero(state);
  if (!hero || hero.path.length === 0) return;
  const under = tileOf(hero);
  let remaining = HERO_JOBS[hero.job].speed * TERRAIN[tileAt(state.grid, under.x, under.y).terrain].speedMultiplier * dt;

  for (let guard = 0; remaining > 0 && hero.path.length > 0 && guard < 4; guard++) {
    const next = hero.path[0];
    if (!isGroundPassable(state.grid, next.x, next.y)) {
      const destination = hero.path[hero.path.length - 1];
      hero.path = findPath(state.grid, tileOf(hero), destination) ?? [];
      continue;
    }
    const d = distance(hero, next);
    if (d > remaining) {
      hero.x += ((next.x - hero.x) / d) * remaining;
      hero.y += ((next.y - hero.y) / d) * remaining;
      return;
    }
    hero.x = next.x;
    hero.y = next.y;
    remaining -= d;
    hero.path.shift();
  }
}

function updateHeroAttack(state: BattleState, dt: number): void {
  const hero = activeHero(state);
  if (!hero) return;
  const job = HERO_JOBS[hero.job];
  const engaged = state.enemies.filter((e) => e.engaged && !e.dead);

  if (engaged.length === 0 && state.time - hero.lastHitAt >= REGEN_DELAY) {
    hero.hp = Math.min(hero.maxHp, hero.hp + job.regenPerSecond * dt);
  }

  hero.attackCooldown -= dt;
  if (hero.attackCooldown > 0) return;

  // 足止めしている敵がいればそれを、いなければ射程内で一番城に近い敵を狙う
  let target: Enemy | null = null;
  if (engaged.length > 0) {
    target = engaged.reduce((a, b) => (b.hp < a.hp ? b : a));
  } else {
    let best = Infinity;
    for (const enemy of state.enemies) {
      if (enemy.dead || (ENEMIES[enemy.type].flying && !job.canHitAir)) continue;
      if (distance(hero, enemy) > job.range) continue;
      const remaining = remainingDistance(state, enemy);
      if (remaining < best) {
        best = remaining;
        target = enemy;
      }
    }
  }
  if (!target) {
    hero.attackCooldown = 0;
    return;
  }
  hero.attackCooldown += job.interval;
  state.events.push({ type: 'heroStrike', job: hero.job, fromX: hero.x, fromY: hero.y, toX: target.x, toY: target.y });
  if (job.splashRadius > 0) {
    state.events.push({ type: 'splash', x: target.x, y: target.y, radius: job.splashRadius });
    const center = { x: target.x, y: target.y };
    for (const enemy of state.enemies) {
      if (!enemy.dead && distance(enemy, center) <= job.splashRadius) damageEnemy(state, enemy, job.damage);
    }
  } else {
    damageEnemy(state, target, job.damage);
  }
}

function heroDown(state: BattleState, hero: Hero, killedBy: EnemyId): void {
  hero.status = 'down';
  hero.hp = 0;
  hero.respawnLeft = HERO_JOBS[hero.job].respawnTime;
  hero.path = [];
  hero.deaths++;
  state.deathLog.push({
    heroName: hero.name,
    job: hero.job,
    stageName: state.stage.name,
    wave: state.waveIndex + 1,
    killedBy,
    time: state.time,
  });
  for (const enemy of state.enemies) enemy.engaged = false;
  state.events.push({ type: 'heroDown', heroUid: hero.uid, x: hero.x, y: hero.y });
}
