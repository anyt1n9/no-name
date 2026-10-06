// 画面の大きさ・色・フォントなどの見た目の設定。

import { FIRST_STAGE } from '../data/stage';

/** 1マスの大きさ（ピクセル） */
export const TILE = 48;
export const MAP_WIDTH = FIRST_STAGE.width * TILE;
export const MAP_HEIGHT = FIRST_STAGE.height * TILE;
export const SIDEBAR_WIDTH = 260;
export const BOTTOM_HEIGHT = 52;
export const GAME_WIDTH = MAP_WIDTH + SIDEBAR_WIDTH;
export const GAME_HEIGHT = MAP_HEIGHT + BOTTOM_HEIGHT;

export const FONT =
  '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", "Noto Sans JP", "Noto Sans CJK JP", sans-serif';

export const COLORS = {
  background: 0x14161c,
  panel: 0x1c1f27,
  panelBorder: 0x343846,
  button: 0x2a2e3a,
  buttonHover: 0x363b4a,
  buttonSelected: 0x7a5d1e,
  buttonDisabled: 0x22252e,
  buttonBorder: 0x4a5062,
  plain: 0x3d5c36,
  plainAlt: 0x395633,
  gridLine: 0x000000,
  mountainBase: 0x4f5058,
  mountain: 0x8a8b96,
  snow: 0xe2e2ea,
  forestBase: 0x2b4627,
  forestTree: 0x2f8a45,
  forestTreeDark: 0x24703a,
  entrance: 0x6e2a2a,
  castle: 0x7d6b48,
  castleTop: 0xa89060,
  route: 0xf0d070,
  routePreview: 0x7fe3ff,
  valid: 0x6fdc7a,
  invalid: 0xff5a4f,
  hpBack: 0x2a1515,
  hpFill: 0x5fd06a,
  hpLow: 0xe0503e,
  heroOutline: 0xffffff,
  slowRing: 0x8fd0ff,
};

export const TEXT_COLORS = {
  main: '#ece9e1',
  sub: '#9aa0ad',
  accent: '#f0c060',
  danger: '#ff7a6b',
  good: '#7fe08a',
};

/** マス座標（マスの中心が整数）をピクセル座標に変える */
export function toPixel(value: number): number {
  return value * TILE + TILE / 2;
}
