import * as Phaser from 'phaser';
import { BattleScene } from './view/BattleScene';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from './view/layout';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.background,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BattleScene],
});
