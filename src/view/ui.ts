// サイドバーなどで使う、シンプルなボタン。

import * as Phaser from 'phaser';
import { COLORS, FONT, TEXT_COLORS } from './layout';

export interface ButtonOptions {
  width: number;
  height: number;
  fontSize?: number;
  onClick: () => void;
  /** マウスを乗せたときに呼ばれる（説明文の表示などに使う） */
  onHover?: () => void;
}

export class Button {
  readonly background: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  private enabled = true;
  private selected = false;
  private hovered = false;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, private readonly options: ButtonOptions) {
    this.background = scene.add
      .rectangle(x, y, options.width, options.height, COLORS.button)
      .setOrigin(0)
      .setStrokeStyle(1, COLORS.buttonBorder)
      .setInteractive({ useHandCursor: true });
    this.label = scene.add
      .text(x + options.width / 2, y + options.height / 2, text, {
        fontFamily: FONT,
        fontSize: `${options.fontSize ?? 14}px`,
        color: TEXT_COLORS.main,
        align: 'center',
      })
      .setOrigin(0.5);

    this.background.on('pointerover', () => {
      this.hovered = true;
      this.refresh();
      this.options.onHover?.();
    });
    this.background.on('pointerout', () => {
      this.hovered = false;
      this.refresh();
    });
    this.background.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || !this.enabled) return;
      this.options.onClick();
    });
  }

  setText(text: string): this {
    if (this.label.text !== text) this.label.setText(text);
    return this;
  }

  setEnabled(enabled: boolean): this {
    if (this.enabled !== enabled) {
      this.enabled = enabled;
      this.refresh();
    }
    return this;
  }

  setSelected(selected: boolean): this {
    if (this.selected !== selected) {
      this.selected = selected;
      this.refresh();
    }
    return this;
  }

  setVisible(visible: boolean): this {
    if (this.background.visible === visible) return this;
    this.background.setVisible(visible);
    this.label.setVisible(visible);
    if (visible) this.background.setInteractive({ useHandCursor: true });
    else this.background.disableInteractive();
    return this;
  }

  setDepth(depth: number): this {
    this.background.setDepth(depth);
    this.label.setDepth(depth + 0.1);
    return this;
  }

  private refresh(): void {
    let color = COLORS.button;
    if (this.selected) color = COLORS.buttonSelected;
    else if (!this.enabled) color = COLORS.buttonDisabled;
    else if (this.hovered) color = COLORS.buttonHover;
    this.background.setFillStyle(color);
    this.label.setAlpha(this.enabled || this.selected ? 1 : 0.45);
  }
}
