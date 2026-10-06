// 画面のくっきりさの調整。
// ゲームは 980×580 の座標で作っているが、全画面などで大きく表示するときは、
// 実際の表示サイズ（と画面の画素の細かさ）に合わせて、内部をこの倍率で細かく描く。

import { GAME_HEIGHT, GAME_WIDTH } from './layout';

export const display = { scale: 1 };

/** 倍率が変わったときに、ゲーム全体へ知らせるイベント名 */
export const RENDER_SCALE_EVENT = 'render-scale';

/** 表示する場所の大きさから、内部で描く倍率を決める（1〜4倍、0.25刻み） */
export function computeRenderScale(parent: HTMLElement): number {
  const fit = Math.min(parent.clientWidth / GAME_WIDTH, parent.clientHeight / GAME_HEIGHT);
  const pixelRatio = window.devicePixelRatio || 1;
  const scale = Math.max(1, fit * pixelRatio);
  return Math.min(4, Math.round(scale * 4) / 4);
}
