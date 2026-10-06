import * as Phaser from 'phaser';
import { BattleScene } from './view/BattleScene';
import { computeRenderScale, display, RENDER_SCALE_EVENT } from './view/display';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from './view/layout';

const parent = document.getElementById('game')!;
display.scale = computeRenderScale(parent);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  width: Math.round(GAME_WIDTH * display.scale),
  height: Math.round(GAME_HEIGHT * display.scale),
  backgroundColor: COLORS.background,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BattleScene],
});

// 全画面にしたり、ウィンドウの大きさを変えたりしたら、くっきり描けるよう倍率を合わせ直す
let resizeTimer = 0;
new ResizeObserver(() => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const next = computeRenderScale(parent);
    if (Math.abs(next - display.scale) < 0.01) return;
    display.scale = next;
    game.scale.setGameSize(Math.round(GAME_WIDTH * next), Math.round(GAME_HEIGHT * next));
    game.events.emit(RENDER_SCALE_EVENT, next);
  }, 150);
}).observe(parent);
