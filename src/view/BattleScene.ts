// 防衛戦の画面。ルール（src/core）を毎フレーム進め、その状態を図形で描く。
// 見た目は仮で、後から画像素材に差し替える前提。

import * as Phaser from 'phaser';
import {
  checkTerrainPlacement,
  checkTowerPlacement,
  createBattle,
  deployHero,
  drainEvents,
  enemyRoute,
  FIXED_DT,
  moveHero,
  placeTerrain,
  placeTower,
  previewRoute,
  startCombat,
  step,
  towerInterval,
  towerRange,
  type BattleState,
} from '../core/battle';
import { samePoint, tileAt, tileIndex, type GridPoint } from '../core/grid';
import { ENEMIES } from '../data/enemies';
import { HERO_JOBS } from '../data/heroes';
import { FIRST_STAGE } from '../data/stage';
import { TERRAIN } from '../data/terrain';
import { TOWER_ORDER, TOWERS, type TowerId } from '../data/towers';
import {
  COLORS,
  FONT,
  GAME_HEIGHT,
  MAP_HEIGHT,
  MAP_WIDTH,
  SIDEBAR_WIDTH,
  TEXT_COLORS,
  TILE,
  toPixel,
  BOTTOM_HEIGHT,
} from './layout';
import { Button } from './ui';

type Selection = { kind: 'card'; index: number } | { kind: 'tower'; id: TowerId } | null;

/** 一瞬だけ表示する演出（座標はピクセル） */
interface Effect {
  kind: 'line' | 'ring' | 'spark';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  radius: number;
  color: number;
  life: number;
  ttl: number;
}

const SHOT_COLORS: Record<TowerId, number> = { arrow: 0xf5e6b0, fire: 0xff8a4a, water: 0x8fd0ff };

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

function textStyle(size: number, color: string = TEXT_COLORS.main, bold = false): TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal' };
}

function seedFromUrl(): number | null {
  const value = new URLSearchParams(window.location.search).get('seed');
  if (value === null) return null;
  const seed = Number(value);
  return Number.isInteger(seed) && seed >= 0 ? seed : null;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

/** 見た目だけに使う、マスごとに決まった値（ゲームのルールには影響しない） */
function tileHash(seed: number, x: number, y: number, salt: number): number {
  let h = (seed ^ Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(salt, 0x7feb352d)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export class BattleScene extends Phaser.Scene {
  private state!: BattleState;
  private accumulator = 0;
  private paused = false;
  private speed = 1;
  private selection: Selection = null;
  private hoverTile: GridPoint | null = null;
  private mapDirty = true;
  private resultShown = false;
  private castleFlash = 0;
  private effects: Effect[] = [];
  private errorMessage = '';
  private errorTimer = 0;
  private infoMessage = '';

  private terrainGfx!: Phaser.GameObjects.Graphics;
  private routeGfx!: Phaser.GameObjects.Graphics;
  private hoverGfx!: Phaser.GameObjects.Graphics;
  private entityGfx!: Phaser.GameObjects.Graphics;
  private effectGfx!: Phaser.GameObjects.Graphics;
  private sidebarGfx!: Phaser.GameObjects.Graphics;
  private terrainLabels: Phaser.GameObjects.Text[] = [];
  private towerLabels = new Map<number, Phaser.GameObjects.Text>();
  private enemyLabels = new Map<number, Phaser.GameObjects.Text>();
  /** 地形を描き直すかどうかを決めるための、前回描いたルート */
  private drawnRouteKey = '';
  private heroLabel!: Phaser.GameObjects.Text;
  private pauseLabel!: Phaser.GameObjects.Text;

  private phaseText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private heroNameText!: Phaser.GameObjects.Text;
  private heroInfoText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private startButton!: Button;
  private pauseButton!: Button;
  private speedButton!: Button;
  private heroButton!: Button;
  private cardButtons: Button[] = [];
  private towerButtons = new Map<TowerId, Button>();
  private sidebarLeft = 0;
  private sidebarInner = 0;

  constructor() {
    super('battle');
  }

  init(data: { seed?: number }): void {
    const seed = data.seed ?? seedFromUrl() ?? randomSeed();
    this.state = createBattle(FIRST_STAGE, seed);
    this.accumulator = 0;
    this.paused = false;
    this.speed = 1;
    this.selection = null;
    this.hoverTile = null;
    this.mapDirty = true;
    this.resultShown = false;
    this.castleFlash = 0;
    this.effects = [];
    this.errorMessage = '';
    this.errorTimer = 0;
    this.infoMessage = '';
    this.terrainLabels = [];
    this.towerLabels = new Map();
    this.enemyLabels = new Map();
    this.drawnRouteKey = '';
    this.cardButtons = [];
    this.towerButtons = new Map();
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.input.mouse?.disableContextMenu();

    this.terrainGfx = this.add.graphics().setDepth(0);
    this.routeGfx = this.add.graphics().setDepth(2);
    this.hoverGfx = this.add.graphics().setDepth(3);
    this.entityGfx = this.add.graphics().setDepth(4);
    this.effectGfx = this.add.graphics().setDepth(6);
    this.heroLabel = this.add
      .text(0, 0, HERO_JOBS[this.state.hero.job].icon, { ...textStyle(17, '#ffffff', true), stroke: '#10204a', strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(5)
      .setVisible(false);
    this.pauseLabel = this.add
      .text(MAP_WIDTH / 2, MAP_HEIGHT / 2, '一時停止中\nSpaceキーで再開', {
        ...textStyle(26, '#ffffff', true),
        align: 'center',
        backgroundColor: '#000000aa',
        padding: { x: 18, y: 12 },
      })
      .setOrigin(0.5)
      .setDepth(8)
      .setVisible(false);

    this.createSidebar();
    this.createBottomBar();
    this.setupInput();
  }

  update(_time: number, delta: number): void {
    const realDt = Math.min(delta, 100) / 1000;
    const running = this.isRunning();
    if (running && !this.paused) {
      this.accumulator += realDt * this.speed;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < 30) {
        step(this.state, FIXED_DT);
        this.accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === 30) this.accumulator = 0;
    }

    const effectDt = this.paused ? 0 : realDt * this.speed;
    this.handleEvents();
    for (const effect of this.effects) effect.life += effectDt;
    this.effects = this.effects.filter((e) => e.life < e.ttl);
    this.castleFlash = Math.max(0, this.castleFlash - realDt);
    this.errorTimer = Math.max(0, this.errorTimer - realDt);

    const route = enemyRoute(this.state);
    const routeKey = route.map((p) => `${p.x},${p.y}`).join(' ');
    if (this.mapDirty || routeKey !== this.drawnRouteKey) {
      this.drawTerrain(route);
      this.drawnRouteKey = routeKey;
      this.mapDirty = false;
    }
    this.drawRouteArrows(route);
    this.drawHover();
    this.drawEntities();
    this.drawEffects();
    this.refreshSidebar();
    this.refreshMessage();
    this.pauseLabel.setVisible(this.paused && running);

    if (!this.isRunning() && !this.resultShown) this.showResult();
  }

  // -------------------------------------------------------------------------
  // 画面の部品を作る
  // -------------------------------------------------------------------------

  private createSidebar(): void {
    const x = MAP_WIDTH;
    this.add.rectangle(x, 0, SIDEBAR_WIDTH, GAME_HEIGHT, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.panelBorder);
    this.sidebarGfx = this.add.graphics().setDepth(1);
    const left = x + 12;
    const width = SIDEBAR_WIDTH - 24;
    this.sidebarLeft = left;
    this.sidebarInner = width;

    this.add.text(left, 10, 'ソウルパス（仮）', textStyle(18, TEXT_COLORS.main, true));
    this.add.text(left, 34, `シード ${this.state.seed}　v0.1.1`, textStyle(11, TEXT_COLORS.sub));
    this.phaseText = this.add.text(left, 54, '', textStyle(15, TEXT_COLORS.accent, true));
    this.statusText = this.add.text(left, 76, '', textStyle(14));
    this.waveText = this.add.text(left, 98, '', textStyle(12, TEXT_COLORS.sub));

    this.startButton = new Button(this, left, 120, '戦闘開始 ▶', {
      width,
      height: 34,
      fontSize: 15,
      onClick: () => this.onStart(),
      onHover: () => this.setInfo('準備ができたら押してください。敵が攻めてきます。'),
    });
    const half = (width - 6) / 2;
    this.pauseButton = new Button(this, left, 120, '一時停止', {
      width: half,
      height: 34,
      onClick: () => this.togglePause(),
      onHover: () => this.setInfo('一時停止中も、タワーの建設や英雄への指示ができます。Spaceキーでも切り替えられます。'),
    });
    this.speedButton = new Button(this, left + half + 6, 120, '速度 ×1', {
      width: half,
      height: 34,
      onClick: () => this.toggleSpeed(),
      onHover: () => this.setInfo('ゲームの速さを2倍にします。'),
    });
    this.pauseButton.setVisible(false);
    this.speedButton.setVisible(false);

    this.add.text(left, 166, '地形カード（準備フェーズのみ）', textStyle(12, TEXT_COLORS.sub));
    const cardSize = 44;
    const cardGap = (width - cardSize * FIRST_STAGE.handSize) / (FIRST_STAGE.handSize - 1);
    for (let i = 0; i < FIRST_STAGE.handSize; i++) {
      this.cardButtons.push(
        new Button(this, left + i * (cardSize + cardGap), 186, '', {
          width: cardSize,
          height: cardSize,
          fontSize: 18,
          onClick: () => this.selectCard(i),
          onHover: () => this.describeCard(i),
        }),
      );
    }

    this.add.text(left, 244, 'タワー（1〜3キーでも選べる）', textStyle(12, TEXT_COLORS.sub));
    const towerWidth = (width - 12) / 3;
    TOWER_ORDER.forEach((id, i) => {
      const def = TOWERS[id];
      this.towerButtons.set(
        id,
        new Button(this, left + i * (towerWidth + 6), 264, `${def.name}\n${def.cost}G`, {
          width: towerWidth,
          height: 50,
          fontSize: 13,
          onClick: () => this.selectTower(id),
          onHover: () => this.setInfo(`${def.name}（${def.cost}G）：${def.description}`),
        }),
      );
    });

    const job = HERO_JOBS[this.state.hero.job];
    this.add.text(left, 328, '英雄', textStyle(12, TEXT_COLORS.sub));
    this.heroNameText = this.add.text(left, 346, '', textStyle(15, TEXT_COLORS.main, true));
    this.heroInfoText = this.add.text(left, 382, '', textStyle(12, TEXT_COLORS.sub));
    this.heroButton = new Button(this, left, 402, '出撃する', {
      width,
      height: 34,
      onClick: () => this.onDeploy(),
      onHover: () =>
        this.setInfo(`${job.name}：${job.description}倒れても${job.respawnTime}秒後に再び出撃できる。出撃後は右クリックで移動。`),
    });

    // 味方と敵の見分け方
    this.add.text(left, 446, '見分け方', textStyle(12, TEXT_COLORS.sub));
    const legend = this.add.graphics().setDepth(1);
    legend.fillStyle(COLORS.ally);
    legend.fillCircle(left + 7, 476, 6);
    legend.lineStyle(2, COLORS.heroOutline, 1);
    legend.strokeCircle(left + 7, 476, 6);
    this.add.text(left + 20, 468, '味方は青（英雄・タワー・城）', textStyle(12, TEXT_COLORS.ally));
    legend.fillStyle(ENEMIES.goblin.color);
    legend.fillCircle(left + 7, 496, 6);
    legend.lineStyle(2, COLORS.enemy, 1);
    legend.strokeCircle(left + 7, 496, 6);
    this.add.text(left + 20, 488, '敵は赤（入口から攻めてくる）', textStyle(12, TEXT_COLORS.enemy));

    this.add.text(
      left,
      512,
      ['左クリック：置く・建てる', '右クリック：英雄を移動', 'Esc：選択をやめる', 'Space：一時停止'].join('\n'),
      { ...textStyle(11, TEXT_COLORS.sub), lineSpacing: 3 },
    );
  }

  private createBottomBar(): void {
    this.add.rectangle(0, MAP_HEIGHT, MAP_WIDTH, BOTTOM_HEIGHT, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.panelBorder);
    this.messageText = this.add.text(12, MAP_HEIGHT + 9, '', {
      ...textStyle(13),
      wordWrap: { width: MAP_WIDTH - 24, useAdvancedWrap: true },
      lineSpacing: 3,
    });
  }

  private setupInput(): void {
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.hoverTile = this.tileFromPointer(pointer);
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const tile = this.tileFromPointer(pointer);
      if (!tile || !this.isRunning()) return;
      if (pointer.rightButtonDown()) this.commandMoveHero(tile);
      else this.commandPlace(tile);
    });
    const keyboard = this.input.keyboard;
    keyboard?.on('keydown-ESC', () => this.clearSelection());
    keyboard?.on('keydown-SPACE', () => this.togglePause());
    keyboard?.on('keydown-ONE', () => this.selectTower('arrow'));
    keyboard?.on('keydown-TWO', () => this.selectTower('fire'));
    keyboard?.on('keydown-THREE', () => this.selectTower('water'));
  }

  private tileFromPointer(pointer: Phaser.Input.Pointer): GridPoint | null {
    const x = pointer.worldX;
    const y = pointer.worldY;
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return null;
    return { x: Math.floor(x / TILE), y: Math.floor(y / TILE) };
  }

  // -------------------------------------------------------------------------
  // 操作
  // -------------------------------------------------------------------------

  private isRunning(): boolean {
    return this.state.phase === 'prep' || this.state.phase === 'combat';
  }

  private commandPlace(tile: GridPoint): void {
    const selection = this.selection;
    if (!selection) return;
    if (selection.kind === 'card') {
      const result = placeTerrain(this.state, selection.index, tile.x, tile.y);
      if (!result.ok) return this.showError(result.reason);
      this.selection = null;
      this.mapDirty = true;
    } else {
      const result = placeTower(this.state, selection.id, tile.x, tile.y);
      if (!result.ok) return this.showError(result.reason);
      // 続けて同じタワーを建てられるよう、お金が足りる間は選んだままにする
      if (this.state.gold < TOWERS[selection.id].cost) this.selection = null;
    }
  }

  private commandMoveHero(tile: GridPoint): void {
    const result = moveHero(this.state, tile.x, tile.y);
    if (!result.ok) this.showError(result.reason);
  }

  private onStart(): void {
    const result = startCombat(this.state);
    if (!result.ok) return this.showError(result.reason);
    if (this.selection?.kind === 'card') this.selection = null;
    this.infoMessage = '';
  }

  private onDeploy(): void {
    const result = deployHero(this.state);
    if (!result.ok) return this.showError(result.reason);
    this.setInfo('英雄が城から出撃しました。マップを右クリックすると、その場所へ移動します。');
  }

  private togglePause(): void {
    if (this.state.phase !== 'combat') return;
    this.paused = !this.paused;
  }

  private toggleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : 1;
  }

  private selectCard(index: number): void {
    if (this.state.phase !== 'prep' || !this.state.hand[index]) return;
    const same = this.selection?.kind === 'card' && this.selection.index === index;
    this.selection = same ? null : { kind: 'card', index };
    this.describeCard(index);
  }

  private selectTower(id: TowerId): void {
    if (!this.isRunning()) return;
    const same = this.selection?.kind === 'tower' && this.selection.id === id;
    this.selection = same ? null : { kind: 'tower', id };
    const def = TOWERS[id];
    this.setInfo(`${def.name}（${def.cost}G）：${def.description}`);
  }

  private clearSelection(): void {
    this.selection = null;
  }

  private describeCard(index: number): void {
    const card = this.state.hand[index];
    if (!card) return;
    const def = TERRAIN[card.terrain];
    this.setInfo(`${def.name}：${def.description}`);
  }

  private setInfo(text: string): void {
    this.infoMessage = text;
  }

  private showError(text: string): void {
    this.errorMessage = text;
    this.errorTimer = 2.5;
  }

  // -------------------------------------------------------------------------
  // 出来事（演出）
  // -------------------------------------------------------------------------

  private handleEvents(): void {
    for (const event of drainEvents(this.state)) {
      switch (event.type) {
        case 'shot':
          this.addEffect('line', toPixel(event.fromX), toPixel(event.fromY), toPixel(event.toX), toPixel(event.toY), 0, SHOT_COLORS[event.tower], 0.12);
          break;
        case 'splash':
          this.addEffect('ring', toPixel(event.x), toPixel(event.y), 0, 0, event.radius * TILE, 0xff8a4a, 0.3);
          break;
        case 'enemyKilled':
          this.floatText(`+${event.reward}G`, toPixel(event.x), toPixel(event.y) - 10, TEXT_COLORS.accent);
          break;
        case 'castleHit':
          this.castleFlash = 0.35;
          break;
        case 'heroStrike':
          this.addEffect('spark', toPixel(event.x), toPixel(event.y), 0, 0, 0, 0xffffff, 0.15);
          break;
        case 'heroDown': {
          const hero = this.state.hero;
          const job = HERO_JOBS[hero.job];
          this.addEffect('ring', toPixel(event.x), toPixel(event.y), 0, 0, TILE * 0.8, 0xff5a4f, 0.6);
          this.showError(`${job.name}${hero.name}が倒れた…（${job.respawnTime}秒後に再び出撃できます）`);
          break;
        }
        case 'waveStart':
          this.banner(`敵襲！ ウェーブ ${event.wave} / ${this.state.stage.waves.length}`);
          break;
      }
    }
  }

  private addEffect(kind: Effect['kind'], x1: number, y1: number, x2: number, y2: number, radius: number, color: number, ttl: number): void {
    this.effects.push({ kind, x1, y1, x2, y2, radius, color, ttl, life: 0 });
  }

  private floatText(text: string, x: number, y: number, color: string): void {
    const label = this.add.text(x, y, text, { ...textStyle(13, color, true), stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(7);
    this.tweens.add({ targets: label, y: y - 24, alpha: 0, duration: 700, onComplete: () => label.destroy() });
  }

  private banner(text: string): void {
    const label = this.add
      .text(MAP_WIDTH / 2, MAP_HEIGHT / 2 - 40, text, { ...textStyle(28, TEXT_COLORS.enemy, true), stroke: '#000000', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(7);
    this.tweens.add({ targets: label, alpha: 0, delay: 900, duration: 500, onComplete: () => label.destroy() });
  }

  // -------------------------------------------------------------------------
  // 描画
  // -------------------------------------------------------------------------

  private drawTerrain(route: GridPoint[]): void {
    const g = this.terrainGfx;
    g.clear();
    for (const label of this.terrainLabels) label.destroy();
    this.terrainLabels = [];
    const { grid, entrance, castle, seed } = this.state;

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const left = x * TILE;
        const top = y * TILE;
        const terrain = tileAt(grid, x, y).terrain;
        g.fillStyle(COLORS.plainShades[tileHash(seed, x, y, 1) % COLORS.plainShades.length]);
        g.fillRect(left, top, TILE, TILE);
        if (terrain === 'plain') this.drawGrassDetail(g, left, top, tileHash(seed, x, y, 2));
        if (terrain === 'mountain') this.drawMountain(g, left, top);
        if (terrain === 'forest') this.drawForest(g, left, top);
        if (terrain === 'lake') this.drawLake(g, left, top, tileHash(seed, x, y, 3));
        if (terrain !== 'plain') this.addTerrainLabel(left + 3, top + 1, TERRAIN[terrain].icon, 11);
      }
    }

    // 敵の通る道を、土の道として描く
    this.strokeThickRoute(g, route, COLORS.roadEdge, TILE * 0.5);
    this.strokeThickRoute(g, route, COLORS.road, TILE * 0.36);

    g.lineStyle(1, COLORS.gridLine, 0.1);
    for (let x = 0; x <= grid.width; x++) g.lineBetween(x * TILE, 0, x * TILE, MAP_HEIGHT);
    for (let y = 0; y <= grid.height; y++) g.lineBetween(0, y * TILE, MAP_WIDTH, y * TILE);

    // 敵の入口は赤
    g.fillStyle(COLORS.entrance);
    g.fillRect(entrance.x * TILE + 2, entrance.y * TILE + 2, TILE - 4, TILE - 4);
    g.lineStyle(2, COLORS.enemy, 1);
    g.strokeRect(entrance.x * TILE + 2, entrance.y * TILE + 2, TILE - 4, TILE - 4);
    this.addTerrainLabel(toPixel(entrance.x), toPixel(entrance.y), '入口', 13, true);

    // 味方の城は青
    const castleLeft = castle.x * TILE;
    const castleTop = castle.y * TILE;
    g.fillStyle(COLORS.allyDark);
    g.fillRect(castleLeft + 2, castleTop + 2, TILE - 4, TILE - 4);
    g.fillStyle(COLORS.castle);
    g.fillRect(castleLeft + 6, castleTop + 14, TILE - 12, TILE - 20);
    g.fillStyle(COLORS.castleTop);
    for (let i = 0; i < 3; i++) g.fillRect(castleLeft + 6 + i * 13, castleTop + 7, 10, 9);
    g.lineStyle(2, COLORS.ally, 1);
    g.strokeRect(castleLeft + 2, castleTop + 2, TILE - 4, TILE - 4);
    this.addTerrainLabel(toPixel(castle.x), toPixel(castle.y) + 5, '城', 16, true);
  }

  /** 草原の飾り（花・草むら・小石）。見た目だけで、ルールには関係ない */
  private drawGrassDetail(g: Phaser.GameObjects.Graphics, left: number, top: number, hash: number): void {
    const roll = hash % 100;
    const x = left + 10 + ((hash >>> 8) % 26);
    const y = top + 12 + ((hash >>> 16) % 24);
    if (roll < 9) {
      g.fillStyle(COLORS.flower, 0.85);
      g.fillCircle(x, y, 2);
      g.fillCircle(x + 6, y + 3, 2);
      g.fillCircle(x + 2, y + 7, 1.5);
    } else if (roll < 26) {
      g.lineStyle(2, COLORS.grassTuft, 0.9);
      g.lineBetween(x, y + 6, x - 3, y);
      g.lineBetween(x, y + 6, x, y - 1);
      g.lineBetween(x, y + 6, x + 3, y);
    } else if (roll < 32) {
      g.fillStyle(COLORS.pebble, 0.9);
      g.fillCircle(x, y, 3);
      g.fillCircle(x + 5, y + 2, 2);
    }
  }

  private drawLake(g: Phaser.GameObjects.Graphics, left: number, top: number, hash: number): void {
    g.fillStyle(COLORS.lake);
    g.fillRect(left, top, TILE, TILE);
    g.lineStyle(2, COLORS.lakeRipple, 0.7);
    const y = top + 14 + (hash % 8);
    g.lineBetween(left + 10, y, left + 22, y);
    g.lineBetween(left + 24, y + 12, left + 38, y + 12);
  }

  private addTerrainLabel(x: number, y: number, text: string, size: number, centered = false): void {
    const label = this.add
      .text(x, y, text, { ...textStyle(size, '#ffffff', centered), stroke: '#000000', strokeThickness: centered ? 3 : 0 })
      .setDepth(1)
      .setAlpha(centered ? 1 : 0.75);
    if (centered) label.setOrigin(0.5);
    this.terrainLabels.push(label);
  }

  private drawMountain(g: Phaser.GameObjects.Graphics, left: number, top: number): void {
    g.fillStyle(COLORS.mountainBase);
    g.fillRect(left, top, TILE, TILE);
    g.fillStyle(COLORS.mountain);
    g.fillTriangle(left + 5, top + TILE - 6, left + TILE / 2, top + 8, left + TILE - 5, top + TILE - 6);
    g.fillStyle(COLORS.snow);
    g.fillTriangle(left + TILE / 2 - 6, top + 17, left + TILE / 2, top + 8, left + TILE / 2 + 6, top + 17);
  }

  private drawForest(g: Phaser.GameObjects.Graphics, left: number, top: number): void {
    g.fillStyle(COLORS.forestBase);
    g.fillRect(left, top, TILE, TILE);
    g.fillStyle(COLORS.forestTreeDark);
    g.fillCircle(left + 15, top + 31, 10);
    g.fillStyle(COLORS.forestTree);
    g.fillCircle(left + 32, top + 29, 11);
    g.fillCircle(left + 23, top + 17, 10);
  }

  /** 道の上に、敵の進む向きを示す矢印を描く */
  private drawRouteArrows(route: GridPoint[]): void {
    const g = this.routeGfx;
    g.clear();
    const prep = this.state.phase === 'prep';
    g.lineStyle(2, COLORS.route, prep ? 0.95 : 0.35);
    for (let i = 1; i < route.length - 1; i++) {
      const dx = route[i + 1].x - route[i].x;
      const dy = route[i + 1].y - route[i].y;
      const cx = toPixel(route[i].x);
      const cy = toPixel(route[i].y);
      const tipX = cx + dx * 6;
      const tipY = cy + dy * 6;
      const backX = cx - dx * 4;
      const backY = cy - dy * 4;
      g.lineBetween(backX - dy * 6, backY + dx * 6, tipX, tipY);
      g.lineBetween(backX + dy * 6, backY - dx * 6, tipX, tipY);
    }
  }

  /** マスの列を太い線でつなぐ（角は丸める） */
  private strokeThickRoute(g: Phaser.GameObjects.Graphics, route: GridPoint[], color: number, width: number): void {
    if (route.length < 2) return;
    g.lineStyle(width, color, 1);
    for (let i = 1; i < route.length; i++) {
      g.lineBetween(toPixel(route[i - 1].x), toPixel(route[i - 1].y), toPixel(route[i].x), toPixel(route[i].y));
    }
    g.fillStyle(color, 1);
    for (const p of route) g.fillCircle(toPixel(p.x), toPixel(p.y), width / 2);
  }

  private strokeRoute(g: Phaser.GameObjects.Graphics, route: GridPoint[], color: number, alpha: number, width: number): void {
    if (route.length < 2) return;
    g.lineStyle(width, color, alpha);
    for (let i = 1; i < route.length; i++) {
      g.lineBetween(toPixel(route[i - 1].x), toPixel(route[i - 1].y), toPixel(route[i].x), toPixel(route[i].y));
    }
    g.fillStyle(color, alpha);
    for (const p of route) g.fillCircle(toPixel(p.x), toPixel(p.y), width);
  }

  private drawHover(): void {
    const g = this.hoverGfx;
    g.clear();
    const tile = this.hoverTile;
    if (!tile || !this.isRunning()) return;
    const left = tile.x * TILE;
    const top = tile.y * TILE;
    const cx = toPixel(tile.x);
    const cy = toPixel(tile.y);
    const selection = this.selection;

    if (selection?.kind === 'card') {
      const card = this.state.hand[selection.index];
      const result = checkTerrainPlacement(this.state, selection.index, tile.x, tile.y);
      g.fillStyle(result.ok ? COLORS.valid : COLORS.invalid, 0.35);
      g.fillRect(left, top, TILE, TILE);
      if (result.ok && card) {
        this.strokeRoute(g, previewRoute(this.state, tile.x, tile.y, { terrain: card.terrain }), COLORS.routePreview, 0.9, 2);
      }
      return;
    }

    if (selection?.kind === 'tower') {
      const result = checkTowerPlacement(this.state, selection.id, tile.x, tile.y);
      const color = result.ok ? COLORS.valid : COLORS.invalid;
      g.fillStyle(color, 0.35);
      g.fillRect(left, top, TILE, TILE);
      g.lineStyle(2, color, 0.8);
      g.strokeCircle(cx, cy, towerRange(this.state, { type: selection.id, x: tile.x, y: tile.y }) * TILE);
      return;
    }

    g.lineStyle(2, 0xffffff, 0.5);
    g.strokeRect(left + 1, top + 1, TILE - 2, TILE - 2);
    const towerUid = tileAt(this.state.grid, tile.x, tile.y).towerUid;
    const tower = this.state.towers.find((t) => t.uid === towerUid);
    if (tower) g.strokeCircle(cx, cy, towerRange(this.state, tower) * TILE);
  }

  private drawEntities(): void {
    const g = this.entityGfx;
    g.clear();
    const state = this.state;

    if (this.castleFlash > 0) {
      g.fillStyle(0xff3030, (this.castleFlash / 0.35) * 0.6);
      g.fillRect(state.castle.x * TILE, state.castle.y * TILE, TILE, TILE);
    }

    const seenTowers = new Set<number>();
    for (const tower of state.towers) {
      const def = TOWERS[tower.type];
      const left = tower.x * TILE;
      const top = tower.y * TILE;
      // 味方なので青い台座と青い縁。中の色はタワーの種類
      g.fillStyle(COLORS.allyDark);
      g.fillRect(left + 4, top + 4, TILE - 8, TILE - 8);
      g.lineStyle(2, COLORS.ally, 1);
      g.strokeRect(left + 4, top + 4, TILE - 8, TILE - 8);
      g.fillStyle(def.color);
      g.fillRect(left + 10, top + 10, TILE - 20, TILE - 20);
      seenTowers.add(tower.uid);
      if (!this.towerLabels.has(tower.uid)) {
        const label = this.add
          .text(toPixel(tower.x), toPixel(tower.y), def.icon, { ...textStyle(18, '#ffffff', true), stroke: '#000000', strokeThickness: 3 })
          .setOrigin(0.5)
          .setDepth(5);
        this.towerLabels.set(tower.uid, label);
      }
    }
    for (const [uid, label] of this.towerLabels) {
      if (!seenTowers.has(uid)) {
        label.destroy();
        this.towerLabels.delete(uid);
      }
    }

    const seenEnemies = new Set<number>();
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      const def = ENEMIES[enemy.type];
      const cx = toPixel(enemy.x);
      const cy = toPixel(enemy.y);
      const r = def.radius * TILE;
      // 敵なので赤い縁
      g.fillStyle(def.color);
      g.lineStyle(3, COLORS.enemy, 1);
      if (def.shape === 'circle') {
        g.fillCircle(cx, cy, r);
        g.strokeCircle(cx, cy, r);
      } else {
        g.beginPath();
        g.moveTo(cx, cy - r - 2);
        g.lineTo(cx + r + 2, cy);
        g.lineTo(cx, cy + r + 2);
        g.lineTo(cx - r - 2, cy);
        g.closePath();
        g.fillPath();
        g.strokePath();
      }
      if (enemy.slowMultiplier < 1) {
        g.lineStyle(2, COLORS.slowRing, 0.9);
        g.strokeCircle(cx, cy, r + 4);
      }
      if (enemy.hp < enemy.maxHp) this.drawBar(g, cx, cy - r - 9, TILE * 0.6, enemy.hp / enemy.maxHp, COLORS.enemyHp);
      seenEnemies.add(enemy.uid);
      let label = this.enemyLabels.get(enemy.uid);
      if (!label) {
        label = this.add
          .text(cx, cy, def.icon, { ...textStyle(11, '#ffffff', true), stroke: '#000000', strokeThickness: 3 })
          .setOrigin(0.5)
          .setDepth(5);
        this.enemyLabels.set(enemy.uid, label);
      }
      label.setPosition(cx, cy);
    }
    for (const [uid, label] of this.enemyLabels) {
      if (!seenEnemies.has(uid)) {
        label.destroy();
        this.enemyLabels.delete(uid);
      }
    }

    const hero = state.hero;
    if (hero.status === 'active') {
      const cx = toPixel(hero.x);
      const cy = toPixel(hero.y);
      const destination = hero.path[hero.path.length - 1];
      if (destination) {
        g.lineStyle(2, COLORS.ally, 0.9);
        g.strokeCircle(toPixel(destination.x), toPixel(destination.y), 8);
        g.lineBetween(cx, cy, toPixel(destination.x), toPixel(destination.y));
      }
      // 味方なので青い体に白い縁
      g.fillStyle(COLORS.ally);
      g.fillCircle(cx, cy, TILE * 0.34);
      g.lineStyle(3, COLORS.heroOutline, 1);
      g.strokeCircle(cx, cy, TILE * 0.34);
      this.drawBar(g, cx, cy - TILE * 0.34 - 9, TILE * 0.7, hero.hp / hero.maxHp, COLORS.allyHp);
      this.heroLabel.setPosition(cx, cy).setVisible(true);
    } else {
      this.heroLabel.setVisible(false);
    }
  }

  /** 体力のバー。味方は青、敵は赤 */
  private drawBar(g: Phaser.GameObjects.Graphics, cx: number, y: number, width: number, ratio: number, color: number): void {
    const clamped = Math.max(0, Math.min(1, ratio));
    g.fillStyle(COLORS.hpBack);
    g.fillRect(cx - width / 2 - 1, y - 1, width + 2, 7);
    g.fillStyle(color);
    g.fillRect(cx - width / 2, y, width * clamped, 5);
  }

  private drawEffects(): void {
    const g = this.effectGfx;
    g.clear();
    for (const effect of this.effects) {
      const progress = effect.life / effect.ttl;
      const alpha = 1 - progress;
      if (effect.kind === 'line') {
        g.lineStyle(2, effect.color, alpha);
        g.lineBetween(effect.x1, effect.y1, effect.x2, effect.y2);
      } else if (effect.kind === 'ring') {
        g.lineStyle(3, effect.color, alpha);
        g.strokeCircle(effect.x1, effect.y1, effect.radius * (0.6 + 0.4 * progress));
      } else {
        g.lineStyle(2, effect.color, alpha);
        g.lineBetween(effect.x1 - 7, effect.y1 - 7, effect.x1 + 7, effect.y1 + 7);
        g.lineBetween(effect.x1 - 7, effect.y1 + 7, effect.x1 + 7, effect.y1 - 7);
      }
    }
  }

  // -------------------------------------------------------------------------
  // サイドバーと説明文
  // -------------------------------------------------------------------------

  private refreshSidebar(): void {
    const state = this.state;
    const totalWaves = state.stage.waves.length;
    const prep = state.phase === 'prep';
    const combat = state.phase === 'combat';

    const phaseLabel = {
      prep: '準備フェーズ',
      combat: this.paused ? '一時停止中' : '戦闘中',
      won: '防衛成功！',
      lost: '城が陥落…',
    }[state.phase];
    setText(this.phaseText, phaseLabel);
    setText(this.statusText, `城HP ${state.castleHp}/${state.stage.castleHp}　所持金 ${state.gold}G`);

    if (prep) {
      const route = enemyRoute(state);
      const seconds = state.field[tileIndex(state.grid, state.entrance.x, state.entrance.y)];
      setText(this.waveText, `敵の道のり ${route.length}マス（ゴブリンで約${Math.round(seconds)}秒）`);
    } else {
      const next = combat && state.nextWaveIn !== null ? `　次まで${Math.ceil(state.nextWaveIn)}秒` : '';
      setText(this.waveText, `ウェーブ ${Math.max(1, state.waveIndex + 1)}/${totalWaves}${next}　撃破 ${state.kills}`);
    }

    this.startButton.setVisible(prep);
    this.pauseButton.setVisible(combat).setText(this.paused ? '再開' : '一時停止');
    this.speedButton.setVisible(combat).setText(`速度 ×${this.speed}`);

    this.cardButtons.forEach((button, i) => {
      const card = state.hand[i];
      button.setVisible(card !== undefined);
      if (!card) return;
      button
        .setText(TERRAIN[card.terrain].icon)
        .setEnabled(prep)
        .setSelected(this.selection?.kind === 'card' && this.selection.index === i);
    });

    for (const [id, button] of this.towerButtons) {
      button
        .setEnabled(this.isRunning() && state.gold >= TOWERS[id].cost)
        .setSelected(this.selection?.kind === 'tower' && this.selection.id === id);
    }

    const hero = state.hero;
    const job = HERO_JOBS[hero.job];
    setText(this.heroNameText, `${job.name} ${hero.name}`);
    setText(this.heroInfoText, `倒れた回数 ${hero.deaths}`);
    if (hero.status === 'ready') this.heroButton.setText('出撃する').setEnabled(this.isRunning());
    else if (hero.status === 'active') this.heroButton.setText('出撃中（右クリックで移動）').setEnabled(false);
    else this.heroButton.setText(`復活まで ${Math.ceil(hero.respawnLeft)}秒`).setEnabled(false);

    const g = this.sidebarGfx;
    g.clear();
    const barY = 370;
    g.fillStyle(COLORS.hpBack);
    g.fillRect(this.sidebarLeft, barY, this.sidebarInner, 8);
    if (hero.status === 'down') {
      g.fillStyle(0x6b7080);
      g.fillRect(this.sidebarLeft, barY, this.sidebarInner * (1 - hero.respawnLeft / job.respawnTime), 8);
    } else {
      g.fillStyle(COLORS.allyHp);
      g.fillRect(this.sidebarLeft, barY, this.sidebarInner * (hero.hp / hero.maxHp), 8);
    }
  }

  private refreshMessage(): void {
    let text: string;
    let color: string = TEXT_COLORS.main;
    const hover = this.hoverMessage();
    if (this.errorTimer > 0) {
      text = this.errorMessage;
      color = TEXT_COLORS.danger;
    } else if (hover) {
      text = hover.text;
      if (hover.warning) color = TEXT_COLORS.danger;
    } else if (this.infoMessage) {
      text = this.infoMessage;
    } else if (this.state.phase === 'prep') {
      text = '土の道が敵の通るルート。道を変えられるのは地形カードだけ（全部使わなくてもOK）。タワーは道の横に建てよう。準備ができたら「戦闘開始」。';
    } else {
      text = 'タワーは戦闘中も建てられる。英雄を出撃させたら、マップを右クリックして敵の前に立たせよう。';
    }
    setText(this.messageText, text);
    if (this.messageText.style.color !== color) this.messageText.setColor(color);
  }

  /** マウスを乗せているマスの説明。選択中なら置けない理由を優先して表示する */
  private hoverMessage(): { text: string; warning: boolean } | null {
    const tile = this.hoverTile;
    if (!tile || !this.isRunning()) return null;
    const state = this.state;
    const selection = this.selection;
    if (selection?.kind === 'card') {
      const result = checkTerrainPlacement(state, selection.index, tile.x, tile.y);
      return result.ok ? null : { text: result.reason, warning: true };
    }
    if (selection?.kind === 'tower') {
      const result = checkTowerPlacement(state, selection.id, tile.x, tile.y);
      return result.ok ? null : { text: result.reason, warning: true };
    }
    if (samePoint(tile, state.entrance)) return { text: '入口：ここから敵が現れる。', warning: false };
    if (samePoint(tile, state.castle)) {
      return { text: '城：敵がたどり着くと城HPが減る。0になると負け。', warning: false };
    }
    const mapTile = tileAt(state.grid, tile.x, tile.y);
    const tower = state.towers.find((t) => t.uid === mapTile.towerUid);
    if (tower) {
      const def = TOWERS[tower.type];
      const range = towerRange(state, tower);
      const interval = towerInterval(state, tower);
      return {
        text: `${def.name}：射程 ${range}マス／攻撃間隔 ${interval.toFixed(2)}秒。${def.description}`,
        warning: false,
      };
    }
    if (mapTile.terrain !== 'plain') {
      const def = TERRAIN[mapTile.terrain];
      return { text: `${def.name}：${def.description}`, warning: false };
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // 結果画面
  // -------------------------------------------------------------------------

  private showResult(): void {
    this.resultShown = true;
    this.selection = null;
    this.paused = false;
    const state = this.state;
    const won = state.phase === 'won';
    const depth = 10;

    this.add.rectangle(0, 0, MAP_WIDTH, MAP_HEIGHT, 0x000000, 0.72).setOrigin(0).setDepth(depth).setInteractive();
    this.add
      .text(MAP_WIDTH / 2, 70, won ? '防衛成功！' : '城が陥落した…', textStyle(34, won ? TEXT_COLORS.accent : TEXT_COLORS.danger, true))
      .setOrigin(0.5)
      .setDepth(depth + 1);

    const hero = state.hero;
    const job = HERO_JOBS[hero.job];
    const lines = [
      `残りの城HP　${state.castleHp} / ${state.stage.castleHp}`,
      `到達ウェーブ　${Math.max(1, state.waveIndex + 1)} / ${state.stage.waves.length}`,
      `倒した敵　${state.kills}`,
      `${job.name}${hero.name}が倒れた回数　${hero.deaths}`,
    ];
    if (state.deathLog.length > 0) {
      lines.push('', '― 冒険の記録 ―');
      for (const record of state.deathLog.slice(0, 4)) {
        lines.push(`${HERO_JOBS[record.job].name}${record.heroName}は ウェーブ${record.wave}で ${ENEMIES[record.killedBy].name}に倒された`);
      }
      if (state.deathLog.length > 4) lines.push(`ほか ${state.deathLog.length - 4} 件`);
      lines.push('（この記録は、後の版で「魂の欠片」として次の周回に影響します）');
    }
    this.add
      .text(MAP_WIDTH / 2, 120, lines.join('\n'), { ...textStyle(15), align: 'center', lineSpacing: 6 })
      .setOrigin(0.5, 0)
      .setDepth(depth + 1);

    const y = MAP_HEIGHT - 90;
    new Button(this, MAP_WIDTH / 2 - 230, y, '同じマップで再挑戦', {
      width: 220,
      height: 42,
      fontSize: 15,
      onClick: () => this.scene.restart({ seed: state.seed }),
    }).setDepth(depth + 1);
    new Button(this, MAP_WIDTH / 2 + 10, y, '新しいマップで挑戦', {
      width: 220,
      height: 42,
      fontSize: 15,
      onClick: () => this.scene.restart({ seed: randomSeed() }),
    }).setDepth(depth + 1);
  }
}

/** 文字が変わったときだけ書き換える（毎フレームの無駄な再描画を避ける） */
function setText(label: Phaser.GameObjects.Text, text: string): void {
  if (label.text !== text) label.setText(text);
}
