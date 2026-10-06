// 防衛戦の画面。ルール（src/core）を毎フレーム進め、その状態を図形で描く。
// 見た目は仮で、後から画像素材に差し替える前提。

import * as Phaser from 'phaser';
import {
  activeHero,
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
  type Hero,
} from '../core/battle';
import { samePoint, tileAt, tileIndex, type GridPoint } from '../core/grid';
import { ENEMIES } from '../data/enemies';
import { HERO_JOBS, type HeroJobId } from '../data/heroes';
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
import { drawIcon } from './icons';
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
const HERO_SHOT_COLORS: Record<HeroJobId, number> = { swordsman: 0xffffff, archer: 0xf6e7c8, mage: 0xc9b8ff };

/** サイドバーの英雄1人分の行 */
interface HeroRow {
  uid: number;
  y: number;
  button: Button;
  name: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  deaths: Phaser.GameObjects.Text;
}

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
  /** 地形を描き直すかどうかを決めるための、前回描いたルート */
  private drawnRouteKey = '';
  private pauseLabel!: Phaser.GameObjects.Text;

  private phaseText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private startButton!: Button;
  private pauseButton!: Button;
  private speedButton!: Button;
  private heroRows: HeroRow[] = [];
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
    this.drawnRouteKey = '';
    this.heroRows = [];
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
    this.add.text(left, 34, `シード ${this.state.seed}　v0.1.3`, textStyle(11, TEXT_COLORS.sub));
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

    this.add.text(left, 164, '地形カード（準備フェーズのみ）', textStyle(12, TEXT_COLORS.sub));
    const cardSize = 44;
    const cardGap = (width - cardSize * FIRST_STAGE.handSize) / (FIRST_STAGE.handSize - 1);
    for (let i = 0; i < FIRST_STAGE.handSize; i++) {
      this.cardButtons.push(
        new Button(this, left + i * (cardSize + cardGap), 182, '', {
          width: cardSize,
          height: cardSize,
          fontSize: 18,
          onClick: () => this.selectCard(i),
          onHover: () => this.describeCard(i),
        }),
      );
    }

    this.add.text(left, 236, 'タワー（1〜3キーでも選べる）', textStyle(12, TEXT_COLORS.sub));
    const towerWidth = (width - 12) / 3;
    TOWER_ORDER.forEach((id, i) => {
      const def = TOWERS[id];
      this.towerButtons.set(
        id,
        new Button(this, left + i * (towerWidth + 6), 254, `${def.cost}G`, {
          width: towerWidth,
          height: 50,
          fontSize: 12,
          labelOffsetY: 15,
          onClick: () => this.selectTower(id),
          onHover: () => this.setInfo(`${def.name}（${def.cost}G）：${def.description}`),
        }),
      );
    });

    // 英雄：3人連れていて、戦場に出せるのは1人ずつ
    this.add.text(left, 312, '英雄（クリックで出撃・同時に1人）', textStyle(12, TEXT_COLORS.sub));
    this.state.heroes.forEach((hero, i) => {
      const y = 330 + i * 43;
      const job = HERO_JOBS[hero.job];
      const button = new Button(this, left, y, '', {
        width,
        height: 40,
        onClick: () => this.onDeploy(hero.uid),
        onHover: () =>
          this.setInfo(`${job.name}${hero.name}：${job.description}倒れても${job.respawnTime}秒後に再び出撃できる。`),
      });
      const name = this.add.text(left + 42, y + 3, `${job.name} ${hero.name}`, textStyle(12, TEXT_COLORS.main, true));
      const deaths = this.add.text(left + width - 6, y + 3, '', textStyle(11, TEXT_COLORS.sub)).setOrigin(1, 0);
      const status = this.add.text(left + 42, y + 24, '', textStyle(11, TEXT_COLORS.sub));
      this.heroRows.push({ uid: hero.uid, y, button, name, status, deaths });
    });

    // 味方と敵の見分け方
    const legend = this.add.graphics().setDepth(1);
    legend.fillStyle(COLORS.ally);
    legend.fillCircle(left + 7, 470, 6);
    legend.lineStyle(2, COLORS.heroOutline, 1);
    legend.strokeCircle(left + 7, 470, 6);
    this.add.text(left + 20, 462, '味方は青（英雄・タワー・城）', textStyle(12, TEXT_COLORS.ally));
    legend.fillStyle(ENEMIES.goblin.color);
    legend.fillCircle(left + 7, 489, 6);
    legend.lineStyle(2, COLORS.enemy, 1);
    legend.strokeCircle(left + 7, 489, 6);
    this.add.text(left + 20, 481, '敵は赤（敵の城から攻めてくる）', textStyle(12, TEXT_COLORS.enemy));

    this.add.text(
      left,
      506,
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

  private onDeploy(heroUid: number): void {
    const result = deployHero(this.state, heroUid);
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
          if (event.job === 'swordsman') {
            this.addEffect('spark', toPixel(event.toX), toPixel(event.toY), 0, 0, 0, 0xffffff, 0.15);
          } else {
            const color = HERO_SHOT_COLORS[event.job];
            this.addEffect('line', toPixel(event.fromX), toPixel(event.fromY), toPixel(event.toX), toPixel(event.toY), 0, color, 0.15);
          }
          break;
        case 'heroDown': {
          const hero = this.state.heroes.find((h) => h.uid === event.heroUid);
          if (!hero) break;
          const job = HERO_JOBS[hero.job];
          this.addEffect('ring', toPixel(event.x), toPixel(event.y), 0, 0, TILE * 0.8, 0xff5a4f, 0.6);
          this.showError(`${job.name}${hero.name}が倒れた…（${job.respawnTime}秒後に再び出撃できます。ほかの英雄に交代もできます）`);
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
    const { grid, entrance, castle, seed } = this.state;

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const left = x * TILE;
        const top = y * TILE;
        const terrain = tileAt(grid, x, y).terrain;
        g.fillStyle(COLORS.plainShades[tileHash(seed, x, y, 1) % COLORS.plainShades.length]);
        g.fillRect(left, top, TILE, TILE);
        if (terrain === 'plain') this.drawGrassDetail(g, left, top, tileHash(seed, x, y, 2));
        if (terrain === 'mountain') {
          g.fillStyle(COLORS.mountainBase);
          g.fillRect(left, top, TILE, TILE);
          drawIcon(g, 'mountain', left + TILE / 2, top + TILE / 2, TILE * 0.88);
        }
        if (terrain === 'forest') {
          g.fillStyle(COLORS.forestBase);
          g.fillRect(left, top, TILE, TILE);
          drawIcon(g, 'forest', left + TILE / 2, top + TILE / 2, TILE * 0.88);
        }
        if (terrain === 'lake') this.drawLake(g, left, top, tileHash(seed, x, y, 3));
      }
    }

    // 敵の通る道を、土の道として描く
    this.strokeThickRoute(g, route, COLORS.roadEdge, TILE * 0.5);
    this.strokeThickRoute(g, route, COLORS.road, TILE * 0.36);

    g.lineStyle(1, COLORS.gridLine, 0.1);
    for (let x = 0; x <= grid.width; x++) g.lineBetween(x * TILE, 0, x * TILE, MAP_HEIGHT);
    for (let y = 0; y <= grid.height; y++) g.lineBetween(0, y * TILE, MAP_WIDTH, y * TILE);

    // 敵の城（左端の中央）は赤、味方の城（右端の中央）は青
    this.drawCastle(g, entrance, COLORS.enemyDark, COLORS.entrance, COLORS.enemyCastleTop, COLORS.enemy);
    this.drawCastle(g, castle, COLORS.allyDark, COLORS.castle, COLORS.castleTop, COLORS.ally);
  }

  private drawCastle(g: Phaser.GameObjects.Graphics, at: GridPoint, base: number, wall: number, top: number, border: number): void {
    const left = at.x * TILE;
    const topY = at.y * TILE;
    g.fillStyle(base);
    g.fillRect(left + 2, topY + 2, TILE - 4, TILE - 4);
    g.fillStyle(wall);
    g.fillRect(left + 6, topY + 14, TILE - 12, TILE - 20);
    g.fillStyle(top);
    for (let i = 0; i < 3; i++) g.fillRect(left + 6 + i * 13, topY + 7, 10, 9);
    // 門
    g.fillStyle(base);
    g.fillRect(left + TILE / 2 - 6, topY + TILE - 18, 12, 12);
    g.fillCircle(left + TILE / 2, topY + TILE - 18, 6);
    // 旗
    g.lineStyle(2, 0xe8e8e8, 1);
    g.lineBetween(left + TILE / 2, topY + 7, left + TILE / 2, topY - 4);
    g.fillStyle(border);
    g.fillTriangle(left + TILE / 2, topY - 4, left + TILE / 2 + 11, topY, left + TILE / 2, topY + 3);
    g.lineStyle(2, border, 1);
    g.strokeRect(left + 2, topY + 2, TILE - 4, TILE - 4);
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

    for (const tower of state.towers) {
      const def = TOWERS[tower.type];
      const left = tower.x * TILE;
      const top = tower.y * TILE;
      // 味方なので青い台座と青い縁。中の色とアイコンはタワーの種類
      g.fillStyle(COLORS.allyDark);
      g.fillRect(left + 4, top + 4, TILE - 8, TILE - 8);
      g.lineStyle(2, COLORS.ally, 1);
      g.strokeRect(left + 4, top + 4, TILE - 8, TILE - 8);
      g.fillStyle(def.color);
      g.fillRect(left + 9, top + 9, TILE - 18, TILE - 18);
      drawIcon(g, def.icon, toPixel(tower.x), toPixel(tower.y), TILE * 0.5);
    }

    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      const def = ENEMIES[enemy.type];
      const cx = toPixel(enemy.x);
      const cy = toPixel(enemy.y);
      const r = def.radius * TILE;
      // 敵なので赤い縁。中のアイコンで種類が分かる
      g.fillStyle(def.color);
      g.fillCircle(cx, cy, r);
      g.lineStyle(3, COLORS.enemy, 1);
      g.strokeCircle(cx, cy, r);
      drawIcon(g, def.icon, cx, cy, r * 1.5);
      if (enemy.slowMultiplier < 1) {
        g.lineStyle(2, COLORS.slowRing, 0.9);
        g.strokeCircle(cx, cy, r + 4);
      }
      if (enemy.hp < enemy.maxHp) this.drawBar(g, cx, cy - r - 9, TILE * 0.6, enemy.hp / enemy.maxHp, COLORS.enemyHp);
    }

    const hero = activeHero(state);
    if (hero) {
      const cx = toPixel(hero.x);
      const cy = toPixel(hero.y);
      const destination = hero.path[hero.path.length - 1];
      if (destination) {
        g.lineStyle(2, COLORS.ally, 0.9);
        g.strokeCircle(toPixel(destination.x), toPixel(destination.y), 8);
        g.lineBetween(cx, cy, toPixel(destination.x), toPixel(destination.y));
      }
      const job = HERO_JOBS[hero.job];
      if (job.range > 1.5) {
        // 遠くを攻撃できる英雄は、攻撃が届く範囲をうっすら見せる
        g.lineStyle(1, COLORS.ally, 0.35);
        g.strokeCircle(cx, cy, job.range * TILE);
      }
      this.drawHeroToken(g, hero, cx, cy, TILE * 0.34, true);
      this.drawBar(g, cx, cy - TILE * 0.34 - 9, TILE * 0.7, hero.hp / hero.maxHp, COLORS.allyHp);
    }
  }

  /** 使えないボタンの絵を暗くする */
  private dimArea(g: Phaser.GameObjects.Graphics, area: Phaser.GameObjects.Rectangle): void {
    g.fillStyle(COLORS.buttonDisabled, 0.65);
    g.fillRect(area.x + 1, area.y + 1, area.width - 2, area.height - 2);
  }

  /** 英雄の丸いコマ（味方なので青い体に白い縁、中に役職のアイコン） */
  private drawHeroToken(g: Phaser.GameObjects.Graphics, hero: Hero, cx: number, cy: number, radius: number, available: boolean): void {
    g.fillStyle(available ? COLORS.ally : 0x4a5062);
    g.fillCircle(cx, cy, radius);
    g.lineStyle(3, COLORS.heroOutline, available ? 1 : 0.4);
    g.strokeCircle(cx, cy, radius);
    drawIcon(g, HERO_JOBS[hero.job].icon, cx, cy, radius * 1.45);
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
      button.setEnabled(prep).setSelected(this.selection?.kind === 'card' && this.selection.index === i);
    });

    for (const [id, button] of this.towerButtons) {
      button
        .setEnabled(this.isRunning() && state.gold >= TOWERS[id].cost)
        .setSelected(this.selection?.kind === 'tower' && this.selection.id === id);
    }

    const g = this.sidebarGfx;
    g.clear();

    // 地形カードとタワーのボタンにアイコンを描く
    this.cardButtons.forEach((button, i) => {
      const card = state.hand[i];
      const icon = card ? TERRAIN[card.terrain].icon : null;
      if (!icon) return;
      const bg = button.background;
      drawIcon(g, icon, bg.x + bg.width / 2, bg.y + bg.height / 2, 34);
      if (!prep) this.dimArea(g, bg);
    });
    for (const [id, button] of this.towerButtons) {
      const def = TOWERS[id];
      const bg = button.background;
      const cx = bg.x + bg.width / 2;
      const cy = bg.y + 18;
      g.fillStyle(def.color);
      g.fillRect(cx - 13, cy - 13, 26, 26);
      drawIcon(g, def.icon, cx, cy, 22);
      if (!(this.isRunning() && state.gold >= def.cost)) this.dimArea(g, bg);
    }

    // 英雄の一覧
    const someoneActive = activeHero(state) !== null;
    for (const row of this.heroRows) {
      const hero = state.heroes.find((h) => h.uid === row.uid);
      if (!hero) continue;
      const job = HERO_JOBS[hero.job];
      const canDeploy = this.isRunning() && hero.status === 'ready' && !someoneActive;
      row.button.setEnabled(canDeploy || hero.status === 'active').setSelected(hero.status === 'active');
      setText(row.deaths, `倒れた ${hero.deaths}回`);
      let status: string;
      if (hero.status === 'active') status = '出撃中（右クリックで移動）';
      else if (hero.status === 'down') status = `復活まで ${Math.ceil(hero.respawnLeft)}秒`;
      else if (someoneActive) status = '待機中（交代は倒れたとき）';
      else status = '待機中（クリックで出撃）';
      setText(row.status, status);

      const left = this.sidebarLeft;
      this.drawHeroToken(g, hero, left + 20, row.y + 20, 15, hero.status !== 'down');
      // 体力（倒れているときは復活までの進み具合）
      const barX = left + 42;
      const barWidth = this.sidebarInner - 48;
      g.fillStyle(COLORS.hpBack);
      g.fillRect(barX, row.y + 19, barWidth, 4);
      if (hero.status === 'down') {
        g.fillStyle(0x6b7080);
        g.fillRect(barX, row.y + 19, barWidth * (1 - hero.respawnLeft / job.respawnTime), 4);
      } else {
        g.fillStyle(COLORS.allyHp);
        g.fillRect(barX, row.y + 19, barWidth * (hero.hp / hero.maxHp), 4);
      }
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
      text = 'タワーは戦闘中も建てられる。英雄は右の一覧から1人ずつ出撃でき、倒れたらほかの英雄に交代できる。出撃中の英雄はマップを右クリックして動かそう。';
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
    if (samePoint(tile, state.entrance)) return { text: '敵の城：ここから魔物が攻めてくる。', warning: false };
    if (samePoint(tile, state.castle)) {
      return { text: '味方の城：敵がたどり着くと城HPが減る。0になると負け。', warning: false };
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

    const lines = [
      `残りの城HP　${state.castleHp} / ${state.stage.castleHp}`,
      `到達ウェーブ　${Math.max(1, state.waveIndex + 1)} / ${state.stage.waves.length}`,
      `倒した敵　${state.kills}`,
      `倒れた回数　${state.heroes.map((h) => `${HERO_JOBS[h.job].name}${h.name} ${h.deaths}回`).join('　')}`,
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
