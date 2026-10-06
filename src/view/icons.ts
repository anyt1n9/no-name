// アイコンを図形で描く。文字は使わず、形で何かが分かるようにする。
// 座標は「アイコンの中心が (0, 0)、端が ±1」として考え、size に合わせて拡大して描く。

import * as Phaser from 'phaser';
import type { IconId } from '../data/icons';

type Graphics = Phaser.GameObjects.Graphics;
type Point = [number, number];

/** (cx, cy) を中心に、一辺 size ピクセルの大きさでアイコンを描く */
export function drawIcon(g: Graphics, id: IconId, cx: number, cy: number, size: number): void {
  const pen = new Pen(g, cx, cy, size / 2);
  switch (id) {
    case 'mountain':
      return drawMountain(pen);
    case 'forest':
      return drawForest(pen);
    case 'lake':
      return drawLake(pen);
    case 'arrow':
      return drawArrow(pen);
    case 'flame':
      return drawFlame(pen);
    case 'drop':
      return drawDrop(pen);
    case 'goblin':
      return drawGoblin(pen);
    case 'wolf':
      return drawWolf(pen);
    case 'sword':
      return drawSword(pen);
    case 'bow':
      return drawBow(pen);
    case 'staff':
      return drawStaff(pen);
  }
}

/** -1〜1 の座標で描くための小さな道具 */
class Pen {
  constructor(
    readonly g: Graphics,
    private readonly cx: number,
    private readonly cy: number,
    readonly scale: number,
  ) {}

  x(value: number): number {
    return this.cx + value * this.scale;
  }

  y(value: number): number {
    return this.cy + value * this.scale;
  }

  polygon(points: Point[], color: number, alpha = 1): void {
    const g = this.g;
    g.fillStyle(color, alpha);
    g.beginPath();
    g.moveTo(this.x(points[0][0]), this.y(points[0][1]));
    for (const [px, py] of points.slice(1)) g.lineTo(this.x(px), this.y(py));
    g.closePath();
    g.fillPath();
  }

  circle(x: number, y: number, radius: number, color: number, alpha = 1): void {
    this.g.fillStyle(color, alpha);
    this.g.fillCircle(this.x(x), this.y(y), radius * this.scale);
  }

  ellipse(x: number, y: number, width: number, height: number, color: number): void {
    this.g.fillStyle(color, 1);
    this.g.fillEllipse(this.x(x), this.y(y), width * this.scale, height * this.scale);
  }

  line(x1: number, y1: number, x2: number, y2: number, width: number, color: number, alpha = 1): void {
    this.g.lineStyle(Math.max(1, width * this.scale), color, alpha);
    this.g.lineBetween(this.x(x1), this.y(y1), this.x(x2), this.y(y2));
  }

  arc(x: number, y: number, radius: number, start: number, end: number, width: number, color: number): void {
    const g = this.g;
    g.lineStyle(Math.max(1, width * this.scale), color, 1);
    g.beginPath();
    g.arc(this.x(x), this.y(y), radius * this.scale, start, end);
    g.strokePath();
  }
}

// --- 地形 ---------------------------------------------------------------

function drawMountain(pen: Pen): void {
  pen.polygon([[-1, 0.8], [-0.35, -0.35], [0.3, 0.8]], 0x6c6d78);
  pen.polygon([[-0.55, 0.8], [0.25, -0.85], [1, 0.8]], 0x9a9ba6);
  pen.polygon([[0.25, -0.85], [-0.02, -0.3], [0.12, -0.38], [0.25, -0.26], [0.38, -0.38], [0.52, -0.3]], 0xeeeef4);
}

function drawForest(pen: Pen): void {
  const tree = (x: number, y: number, s: number, color: number) => {
    pen.polygon([[x - 0.08 * s, y + 0.55 * s], [x + 0.08 * s, y + 0.55 * s], [x + 0.08 * s, y + 0.9 * s], [x - 0.08 * s, y + 0.9 * s]], 0x5a3d22);
    pen.polygon([[x, y - 0.9 * s], [x + 0.5 * s, y + 0.05 * s], [x - 0.5 * s, y + 0.05 * s]], color);
    pen.polygon([[x, y - 0.45 * s], [x + 0.65 * s, y + 0.6 * s], [x - 0.65 * s, y + 0.6 * s]], color);
  };
  tree(-0.45, 0.05, 0.75, 0x24703a);
  tree(0.48, 0.1, 0.72, 0x24703a);
  tree(0, -0.12, 0.92, 0x2f8a45);
}

function drawLake(pen: Pen): void {
  pen.ellipse(0, 0.1, 1.9, 1.3, 0x2e7180);
  pen.arc(-0.3, 0.35, 0.3, Math.PI * 1.15, Math.PI * 1.85, 0.12, 0x9fd4dc);
  pen.arc(0.35, 0.05, 0.3, Math.PI * 1.15, Math.PI * 1.85, 0.12, 0x9fd4dc);
}

// --- タワー -------------------------------------------------------------

function drawArrow(pen: Pen): void {
  // 右上を向いた矢
  pen.line(-0.7, 0.7, 0.45, -0.45, 0.16, 0x3a2410);
  pen.polygon([[0.85, -0.85], [0.2, -0.62], [0.62, -0.2]], 0xeef0f6);
  pen.polygon([[-0.55, 0.55], [-0.95, 0.5], [-0.75, 0.3], [-0.42, 0.42]], 0xf6f6f6);
  pen.polygon([[-0.55, 0.55], [-0.5, 0.95], [-0.3, 0.75], [-0.42, 0.42]], 0xf6f6f6);
}

function drawFlame(pen: Pen): void {
  pen.polygon(
    [[0, -1], [0.28, -0.55], [0.55, -0.25], [0.68, 0.2], [0.55, 0.62], [0.25, 0.9], [-0.25, 0.9], [-0.55, 0.62], [-0.68, 0.2], [-0.5, -0.18], [-0.25, 0.05], [-0.18, -0.45]],
    0xffd25a,
  );
  pen.polygon([[0.02, -0.25], [0.25, 0.12], [0.35, 0.45], [0.2, 0.75], [-0.2, 0.75], [-0.35, 0.45], [-0.25, 0.15]], 0xfff6d8);
}

function drawDrop(pen: Pen): void {
  pen.polygon([[0, -0.95], [0.5, 0.05], [-0.5, 0.05]], 0xdcefff);
  pen.circle(0, 0.32, 0.56, 0xdcefff);
  pen.circle(-0.2, 0.32, 0.14, 0xffffff);
}

// --- 敵 ---------------------------------------------------------------

function drawGoblin(pen: Pen): void {
  const skin = 0x33401b;
  pen.polygon([[-1, -0.45], [-0.4, -0.1], [-0.45, 0.3]], skin);
  pen.polygon([[1, -0.45], [0.4, -0.1], [0.45, 0.3]], skin);
  pen.ellipse(0, 0.1, 1.15, 1.35, skin);
  pen.polygon([[-0.38, -0.05], [-0.08, 0.08], [-0.32, 0.16]], 0xffe14d);
  pen.polygon([[0.38, -0.05], [0.08, 0.08], [0.32, 0.16]], 0xffe14d);
  pen.polygon([[-0.22, 0.42], [-0.12, 0.42], [-0.17, 0.58]], 0xffffff);
  pen.polygon([[0.22, 0.42], [0.12, 0.42], [0.17, 0.58]], 0xffffff);
}

function drawWolf(pen: Pen): void {
  pen.polygon(
    [[-0.8, -0.95], [-0.35, -0.42], [0.35, -0.42], [0.8, -0.95], [0.82, -0.1], [0.5, 0.35], [0.2, 0.92], [-0.2, 0.92], [-0.5, 0.35], [-0.82, -0.1]],
    0x2a2530,
  );
  pen.polygon([[-0.62, -0.7], [-0.42, -0.42], [-0.66, -0.3]], 0x6a5f72);
  pen.polygon([[0.62, -0.7], [0.42, -0.42], [0.66, -0.3]], 0x6a5f72);
  pen.polygon([[-0.45, -0.08], [-0.12, 0.05], [-0.4, 0.12]], 0xffd23f);
  pen.polygon([[0.45, -0.08], [0.12, 0.05], [0.4, 0.12]], 0xffd23f);
  pen.circle(0, 0.72, 0.13, 0x000000);
}

// --- 英雄 ---------------------------------------------------------------

function drawSword(pen: Pen): void {
  // 左下から右上へ向いた剣
  const along = (t: number, w: number): Point => [t * 0.707 + w * 0.707, -t * 0.707 + w * 0.707];
  pen.polygon([along(-0.25, -0.13), along(0.85, -0.13), along(1.1, 0), along(0.85, 0.13), along(-0.25, 0.13)], 0xf2f4fa);
  pen.polygon([along(-0.36, -0.45), along(-0.24, -0.45), along(-0.24, 0.45), along(-0.36, 0.45)], 0xf0c060);
  pen.polygon([along(-0.36, -0.08), along(-0.36, 0.08), along(-0.78, 0.08), along(-0.78, -0.08)], 0x6b4424);
  const [px, py] = along(-0.86, 0);
  pen.circle(px, py, 0.12, 0xf0c060);
}

function drawBow(pen: Pen): void {
  // 弓（左にふくらむ）と、左を向いた矢
  pen.arc(0.6, 0, 1.1, Math.PI - 0.9, Math.PI + 0.9, 0.16, 0xf6e7c8);
  const endX = 0.6 - 1.1 * Math.cos(0.9);
  const endY = 1.1 * Math.sin(0.9);
  pen.line(endX, -endY, endX, endY, 0.05, 0xffffff);
  pen.line(0.85, 0, -0.75, 0, 0.09, 0xffffff);
  pen.polygon([[-0.98, 0], [-0.68, -0.18], [-0.68, 0.18]], 0xffffff);
}

function drawStaff(pen: Pen): void {
  pen.line(-0.6, 0.92, 0.3, -0.35, 0.16, 0xd9b98a);
  pen.circle(0.42, -0.55, 0.42, 0xb9a6ff, 0.45);
  pen.circle(0.42, -0.55, 0.27, 0xf4efff);
  pen.line(-0.15, -0.75, -0.15, -0.45, 0.06, 0xffffff);
  pen.line(-0.3, -0.6, 0, -0.6, 0.06, 0xffffff);
}
