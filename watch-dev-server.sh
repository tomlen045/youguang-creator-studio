#!/bin/bash
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$ROOT/creator-studio/vite.config.mjs"
VITE_BIN="$ROOT/node_modules/vite/bin/vite.js"
PORT=5194
URL="http://127.0.0.1:$PORT/"
RUNTIME="$ROOT/creator-studio/runtime"
LOG="$RUNTIME/dev-watchdog.log"
NODE_BIN="${CREATOR_NODE_BIN:-}"

if [ -z "$NODE_BIN" ]; then
  NODE_BIN="$(command -v node 2>/dev/null || true)"
fi
if [ -z "$NODE_BIN" ]; then
  for candidate in "$HOME/.local/bin/node" /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$candidate" ]; then NODE_BIN="$candidate"; break; fi
  done
fi

/bin/mkdir -p "$RUNTIME"

log() {
  /bin/echo "[$(/bin/date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"
}

listener_pid() {
  /usr/sbin/lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | /usr/bin/head -n 1
}

process_command() {
  /bin/ps -p "$1" -o command= 2>/dev/null || true
}

is_creator_process() {
  local command
  command="$(process_command "$1")"
  case "$command" in
    *"$CONFIG"*) return 0 ;;
    *"$ROOT/node_modules/vite/bin/vite.js"*--config*creator-studio/vite.config.mjs*) return 0 ;;
    *"$ROOT/node_modules/.bin/vite"*--config*creator-studio/vite.config.mjs*) return 0 ;;
    *) return 1 ;;
  esac
}

is_healthy() {
  /usr/bin/curl -fsS --max-time 4 "$URL" 2>/dev/null | /usr/bin/grep -Fq '有光 · 创作者工作台'
}

stop_our_process() {
  local pid="$1" attempt
  if ! is_creator_process "$pid"; then return 0; fi
  /bin/kill -TERM "$pid" 2>/dev/null || true
  attempt=0
  while [ "$attempt" -lt 10 ]; do
    if ! is_creator_process "$pid"; then return 0; fi
    /bin/sleep 1
    attempt=$((attempt + 1))
  done
  if is_creator_process "$pid"; then /bin/kill -KILL "$pid" 2>/dev/null || true; fi
}

owned_pid=""
cleanup() {
  if [ -n "$owned_pid" ] && is_creator_process "$owned_pid"; then
    log "看守服务退出，停止由本看守启动的工作台进程 PID=$owned_pid"
    stop_our_process "$owned_pid"
  fi
}
trap cleanup EXIT
trap 'exit 0' INT TERM

if [ ! -x "$NODE_BIN" ] || [ ! -f "$VITE_BIN" ] || [ ! -f "$CONFIG" ]; then
  log "启动条件不完整：Node=$NODE_BIN，Vite=$VITE_BIN，配置=$CONFIG；请先安装 Node.js 依赖。"
fi

unhealthy_since=0
reported_conflict=""
while true; do
  pid="$(listener_pid)"
  if [ -n "$pid" ]; then
    if is_creator_process "$pid"; then
      reported_conflict=""
      if is_healthy; then
        if [ "$unhealthy_since" -ne 0 ]; then log "工作台已恢复响应，PID=$pid"; fi
        unhealthy_since=0
      else
        if [ "$unhealthy_since" -eq 0 ]; then
          unhealthy_since="$SECONDS"
          log "检测到工作台进程但页面暂不可用，开始观察恢复，PID=$pid"
        elif [ $((SECONDS - unhealthy_since)) -ge 30 ]; then
          log "工作台连续 30 秒无响应，重启已确认属于本项目的进程 PID=$pid"
          stop_our_process "$pid"
          unhealthy_since=0
          if [ "$owned_pid" = "$pid" ]; then owned_pid=""; fi
        fi
      fi
    else
      if [ "$reported_conflict" != "$pid" ]; then
        log "端口 $PORT 被其他进程占用 PID=$pid；为避免冲突，不会终止该进程，也不会更换端口。"
        reported_conflict="$pid"
      fi
    fi
    /bin/sleep 10
    continue
  fi

  reported_conflict=""
  unhealthy_since=0
  if [ -n "$owned_pid" ] && is_creator_process "$owned_pid"; then
    /bin/sleep 10
    continue
  fi
  owned_pid=""

  if [ ! -x "$NODE_BIN" ] || [ ! -f "$VITE_BIN" ] || [ ! -f "$CONFIG" ]; then
    /bin/sleep 30
    continue
  fi

  log "5194 空闲，启动创作者工作台。"
  (
    cd "$ROOT" || exit 1
    exec "$NODE_BIN" "$VITE_BIN" --config "$CONFIG"
  ) >> "$LOG" 2>&1 &
  owned_pid=$!

  attempt=0
  while [ "$attempt" -lt 20 ]; do
    /bin/sleep 2
    pid="$(listener_pid)"
    if [ -n "$pid" ] && ! is_creator_process "$pid"; then
      if [ "$reported_conflict" != "$pid" ]; then
        log "启动时发现端口 $PORT 被其他进程占用 PID=$pid；不更换端口、不终止该进程。"
        reported_conflict="$pid"
      fi
      break
    fi
    if [ -n "$pid" ] && is_creator_process "$pid" && is_healthy; then
      log "创作者工作台已就绪：http://127.0.0.1:$PORT/，PID=$pid"
      break
    fi
    if ! is_creator_process "$owned_pid"; then
      log "工作台未能启动；检查 Node、依赖和 Vite 日志后重试。"
      owned_pid=""
      break
    fi
    attempt=$((attempt + 1))
  done
  /bin/sleep 10
done
