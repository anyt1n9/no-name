#!/bin/bash
# Claude Code on the web のセッション開始時に、依存パッケージを入れておく。
# これで `npm test` / `npm run typecheck` / `npm run build` がすぐ使える。
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
# npm install はキャッシュされたコンテナでも差分だけ入れるので、何度実行しても安全
npm install --no-audit --no-fund
