import { describe, expect, it } from 'vitest';
import {
  createBattle,
  deployHero,
  enemyRoute,
  FIXED_DT,
  placeTerrain,
  placeTower,
  startCombat,
  step,
  type BattleState,
} from '../src/core/battle';
import { simulate } from '../src/core/bot';
import { inBounds, tileAt } from '../src/core/grid';
import { computeDistanceField } from '../src/core/pathfinding';
import { HERO_JOBS } from '../src/data/heroes';
import { FIRST_STAGE, type StageDef } from '../src/data/stage';
import { TOWERS } from '../src/data/towers';

/** 最初から置かれている地形をすべて消したバトル（テストで形を決めやすくするため） */
function emptyBattle(seed = 1, stage: StageDef = FIRST_STAGE): BattleState {
  const state = createBattle(stage, seed);
  for (const tile of state.grid.tiles) tile.terrain = 'plain';
  state.field = computeDistanceField(state.grid, state.castle);
  return state;
}

/** 条件を満たすまで時間を進める */
function runUntil(state: BattleState, condition: () => boolean, maxSeconds = 120): boolean {
  for (let i = 0; i < maxSeconds / FIXED_DT; i++) {
    if (condition()) return true;
    step(state);
  }
  return condition();
}

/** 敵の通り道から外れた、タワーを建てられる草原のマス */
function offRouteTile(state: BattleState): { x: number; y: number } {
  const route = enemyRoute(state);
  for (let y = 0; y < state.grid.height; y++) {
    for (let x = 0; x < state.grid.width; x++) {
      const onRoute = route.some((p) => p.x === x && p.y === y);
      const reserved = (x === state.entrance.x && y === state.entrance.y) || (x === state.castle.x && y === state.castle.y);
      if (!onRoute && !reserved && tileAt(state.grid, x, y).terrain === 'plain') return { x, y };
    }
  }
  throw new Error('空いているマスがありません');
}

/** x 列を、y = gapY の1マスだけ残して山で埋める */
function buildWallWithGap(state: BattleState, x: number, gapY: number): void {
  for (let y = 0; y < state.grid.height; y++) {
    if (y !== gapY) tileAt(state.grid, x, y).terrain = 'mountain';
  }
  state.field = computeDistanceField(state.grid, state.castle);
}

describe('マップと準備フェーズ', () => {
  it('同じシード値なら同じマップと手札になる', () => {
    const a = createBattle(FIRST_STAGE, 5);
    const b = createBattle(FIRST_STAGE, 5);
    expect(a.grid.tiles).toEqual(b.grid.tiles);
    expect(a.entrance).toEqual(b.entrance);
    expect(a.castle).toEqual(b.castle);
    expect(a.hand.map((c) => c.terrain)).toEqual(b.hand.map((c) => c.terrain));
    expect(a.hero.name).toBe(b.hero.name);
  });

  it('最初のマップは必ず入口から城へたどり着ける', () => {
    for (let seed = 1; seed <= 30; seed++) {
      expect(enemyRoute(createBattle(FIRST_STAGE, seed)).length).toBeGreaterThan(0);
    }
  });

  it('敵の城は左端の中央、味方の城は右端の中央にある', () => {
    const middle = Math.floor(FIRST_STAGE.height / 2);
    for (let seed = 1; seed <= 30; seed++) {
      const state = createBattle(FIRST_STAGE, seed);
      expect(state.entrance).toEqual({ x: 0, y: middle });
      expect(state.castle).toEqual({ x: FIRST_STAGE.width - 1, y: middle });
    }
  });

  it('敵の城と味方の城のまわりは空いている', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const state = createBattle(FIRST_STAGE, seed);
      for (const point of [state.entrance, state.castle]) {
        expect(tileAt(state.grid, point.x, point.y).terrain).toBe('plain');
      }
    }
  });

  it('マップには山脈などの地形があり、シード値ごとに形が変わる', () => {
    const shapes = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const state = createBattle(FIRST_STAGE, seed);
      const blocked = state.grid.tiles.filter((t) => t.terrain === 'mountain' || t.terrain === 'lake').length;
      expect(blocked).toBeGreaterThanOrEqual(6);
      shapes.add(state.grid.tiles.map((t) => t.terrain[0]).join(''));
    }
    expect(shapes.size).toBe(10);
  });

  it('道を完全に塞ぐ山は置けない', () => {
    const state = emptyBattle();
    buildWallWithGap(state, 7, 0);
    state.hand = [{ uid: 999, terrain: 'mountain' }];
    const result = placeTerrain(state, 0, 7, 0);
    expect(result.ok).toBe(false);
    expect(tileAt(state.grid, 7, 0).terrain).toBe('plain');
  });

  it('入口と城には地形を置けない', () => {
    const state = emptyBattle();
    state.hand = [{ uid: 999, terrain: 'forest' }];
    expect(placeTerrain(state, 0, state.entrance.x, state.entrance.y).ok).toBe(false);
    expect(placeTerrain(state, 0, state.castle.x, state.castle.y).ok).toBe(false);
  });

  it('地形を置くと敵のルートが変わり、カードが手札から消える', () => {
    const state = emptyBattle();
    const before = enemyRoute(state).length;
    const middle = enemyRoute(state)[5];
    state.hand = [{ uid: 999, terrain: 'mountain' }];
    expect(placeTerrain(state, 0, middle.x, middle.y).ok).toBe(true);
    expect(state.hand).toHaveLength(0);
    const after = enemyRoute(state);
    expect(after.some((p) => p.x === middle.x && p.y === middle.y)).toBe(false);
    expect(after.length).toBeGreaterThanOrEqual(before);
  });

  it('地形は準備フェーズにしか置けない', () => {
    const state = emptyBattle();
    state.hand = [{ uid: 999, terrain: 'forest' }];
    startCombat(state);
    expect(placeTerrain(state, 0, 5, 0).ok).toBe(false);
  });
});

describe('タワー', () => {
  it('建てるとお金が減る', () => {
    const state = emptyBattle();
    const gold = state.gold;
    const spot = offRouteTile(state);
    expect(placeTower(state, 'arrow', spot.x, spot.y).ok).toBe(true);
    expect(state.gold).toBe(gold - TOWERS.arrow.cost);
  });

  it('森には建てられない', () => {
    const state = emptyBattle();
    tileAt(state.grid, 5, 0).terrain = 'forest';
    expect(placeTower(state, 'arrow', 5, 0).ok).toBe(false);
  });

  it('お金が足りなければ建てられない', () => {
    const state = emptyBattle();
    state.gold = TOWERS.fire.cost - 1;
    expect(placeTower(state, 'fire', 5, 0).ok).toBe(false);
  });

  it('タワーで道を完全に塞ぐことはできない', () => {
    const state = emptyBattle();
    buildWallWithGap(state, 7, 0);
    expect(placeTower(state, 'arrow', 7, 0).ok).toBe(false);
  });

  it('敵の通り道にはタワーを建てられない', () => {
    const state = emptyBattle();
    const onRoute = enemyRoute(state)[4];
    const result = placeTower(state, 'arrow', onRoute.x, onRoute.y);
    expect(result.ok).toBe(false);
    expect(tileAt(state.grid, onRoute.x, onRoute.y).towerUid).toBeNull();
  });

  it('タワーを建てても敵のルートは変わらない（道を変えられるのは地形カードだけ）', () => {
    const state = createBattle(FIRST_STAGE, 11);
    const before = enemyRoute(state);
    let built = 0;
    for (let y = 0; y < state.grid.height && built < 3; y++) {
      for (let x = 0; x < state.grid.width && built < 3; x++) {
        if (placeTower(state, 'arrow', x, y).ok) built++;
      }
    }
    expect(built).toBe(3);
    expect(enemyRoute(state)).toEqual(before);
  });

  it('敵を倒すとお金が増える', () => {
    // 難しさの調整に左右されないよう、弱い敵だけのステージで確かめる
    const easyStage: StageDef = {
      ...FIRST_STAGE,
      waves: [{ hpMultiplier: 0.5, groups: [{ enemy: 'goblin', count: 3, interval: 1, delay: 0 }] }],
    };
    const state = emptyBattle(1, easyStage);
    const spot = enemyRoute(state)[3];
    const candidates = [
      { x: spot.x, y: spot.y - 1 },
      { x: spot.x, y: spot.y + 1 },
    ].filter((p) => inBounds(state.grid, p.x, p.y));
    expect(candidates.some((p) => placeTower(state, 'arrow', p.x, p.y).ok)).toBe(true);
    const gold = state.gold;
    startCombat(state);
    expect(runUntil(state, () => state.kills > 0)).toBe(true);
    expect(state.gold).toBeGreaterThan(gold);
  });
});

describe('戦闘', () => {
  it('守りがなければ敵が城に着き、城HPが減る', () => {
    const state = emptyBattle();
    startCombat(state);
    expect(runUntil(state, () => state.castleHp < FIRST_STAGE.castleHp)).toBe(true);
  });

  it('城HPが0になると負ける', () => {
    const state = emptyBattle();
    startCombat(state);
    expect(runUntil(state, () => state.phase === 'lost', 600)).toBe(true);
    expect(state.castleHp).toBe(0);
  });

  it('英雄は敵を足止めする', () => {
    const state = emptyBattle();
    startCombat(state);
    deployHero(state);
    const spot = enemyRoute(state)[4];
    state.hero.x = spot.x;
    state.hero.y = spot.y;
    expect(runUntil(state, () => state.enemies.some((e) => e.engaged))).toBe(true);
    const enemy = state.enemies.find((e) => e.engaged)!;
    const position = { x: enemy.x, y: enemy.y };
    for (let i = 0; i < 0.5 / FIXED_DT; i++) step(state);
    expect({ x: enemy.x, y: enemy.y }).toEqual(position);
  });

  it('英雄が倒れると死亡が記録され、時間が経つと再び出撃できる', () => {
    const state = emptyBattle();
    startCombat(state);
    deployHero(state);
    const spot = enemyRoute(state)[4];
    state.hero.x = spot.x;
    state.hero.y = spot.y;
    expect(runUntil(state, () => state.enemies.some((e) => e.engaged))).toBe(true);
    state.hero.hp = 1;
    expect(runUntil(state, () => state.hero.status === 'down', 10)).toBe(true);
    expect(state.hero.deaths).toBe(1);
    expect(state.deathLog).toHaveLength(1);
    expect(state.deathLog[0].heroName).toBe(state.hero.name);
    expect(deployHero(state).ok).toBe(false);

    const respawn = HERO_JOBS.swordsman.respawnTime;
    expect(runUntil(state, () => state.hero.status === 'ready', respawn + 1)).toBe(true);
    expect(deployHero(state).ok).toBe(true);
    expect(state.hero.hp).toBe(state.hero.maxHp);
  });

  it('同じシード値と同じ操作なら、結果も同じになる', () => {
    const options = { terrain: true, towers: true, hero: true };
    expect(simulate(FIRST_STAGE, 3, options)).toEqual(simulate(FIRST_STAGE, 3, options));
  });
});
