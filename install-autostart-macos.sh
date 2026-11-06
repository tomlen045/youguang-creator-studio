#!/bin/bash
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WATCHER="$ROOT/creator-studio/watch-dev-server.sh"
LABEL="com.whm.creator-studio"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST="$PLIST_DIR/$LABEL.plist"
RUNTIME="$ROOT/creator-studio/runtime"
NODE_BIN="$(command -v node 2>/dev/null || true)"

if [ -z "$NODE_BIN" ]; then
  for candidate in "$HOME/.local/bin/node" /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$candidate" ]; then NODE_BIN="$candidate"; break; fi
  done
fi
if [ -z "$NODE_BIN" ]; then
  /bin/echo "找不到 Node.js。请先安装 Node.js，再重新运行此脚本。" >&2
  exit 1
fi
if [ ! -f "$ROOT/node_modules/vite/bin/vite.js" ]; then
  /bin/echo "未找到 Vite 依赖。请先在项目根目录运行 npm install。" >&2
  exit 1
fi

/bin/mkdir -p "$PLIST_DIR" "$RUNTIME"
/bin/chmod +x "$WATCHER"

/usr/bin/python3 - "$PLIST" "$WATCHER" "$NODE_BIN" "$RUNTIME" <<'PY'
import os
import plistlib
import sys

plist_path, watcher, node, runtime = sys.argv[1:]
label = "com.whm.creator-studio"
path = os.path.dirname(node) + ":/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
data = {
    "Label": label,
    "ProgramArguments": ["/bin/bash", watcher],
    "RunAtLoad": True,
    "KeepAlive": True,
    "ThrottleInterval": 10,
    "ProcessType": "Background",
    "EnvironmentVariables": {"CREATOR_NODE_BIN": node, "PATH": path},
    "StandardOutPath": os.path.join(runtime, "launch-agent.out.log"),
    "StandardErrorPath": os.path.join(runtime, "launch-agent.err.log"),
}
with open(plist_path, "wb") as stream:
    plistlib.dump(data, stream, sort_keys=True)
PY

/usr/bin/plutil -lint "$PLIST"
DOMAIN="gui/$(/usr/bin/id -u)"
/bin/launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
/bin/launchctl bootstrap "$DOMAIN" "$PLIST"
/bin/launchctl kickstart -k "$DOMAIN/$LABEL"

/bin/echo "已启用创作者工作台自动恢复。端口固定为 5194；休眠唤醒后会自动检查并恢复。"
/bin/echo "打开：http://127.0.0.1:5194/"
