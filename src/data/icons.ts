// アイコンの種類。絵そのものは画面側（src/view/icons.ts）で描く。
// 文字ではなく形で見分けられるようにするため、データには「どのアイコンか」だけを書く。

export type IconId =
  | 'mountain'
  | 'forest'
  | 'lake'
  | 'arrow'
  | 'flame'
  | 'drop'
  | 'goblin'
  | 'wolf'
  | 'sword'
  | 'bow'
  | 'staff';
