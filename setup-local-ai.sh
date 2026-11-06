#!/bin/bash
set -euo pipefail
studio_dir="$(cd "$(dirname "$0")" && pwd)"
runtime_dir="$studio_dir/runtime"
archive="$runtime_dir/Ollama-darwin.zip.part"
app="$runtime_dir/Ollama.app"
cli="$app/Contents/Resources/ollama"
model='qwen2.5:1.5b'
expected='da3189f87034d224beb0708d77b95180bc03872f6e269d59bd888a216055c58a'
url='https://github.com/ollama/ollama/releases/download/v0.40.13/Ollama-darwin.zip'
mkdir -p "$runtime_dir/models"
if lsof -nP -iTCP:11434 -sTCP:LISTEN >/dev/null 2>&1; then
  printf '%s\n' '端口 11434 已被占用；为避免冲突，未启动或更改任何服务。可在工作台设置中检测已有服务。' >&2
  exit 1
fi
if [ ! -x "$cli" ]; then
  actual=''
  if [ -f "$archive" ]; then actual="$(shasum -a 256 "$archive" | awk '{print $1}')"; fi
  if [ "$actual" != "$expected" ]; then
    printf '%s\n' '正在续传 Ollama 官方安装包（约 230 MB）……'
    downloaded=0
    for attempt in {1..12}; do
      printf '%s\n' "下载尝试 $attempt/12；保留已经下载的数据。"
      if curl --fail --location --show-error --continue-at - --connect-timeout 20 --max-time 300 --speed-limit 1024 --speed-time 45 -o "$archive" "$url"; then downloaded=1; break; fi
      printf '%s\n' '连接中断，将从当前断点继续。'
      sleep 2
    done
    if [ "$downloaded" != 1 ]; then printf '%s\n' '暂时无法完成下载，断点已保留，稍后可再次运行。' >&2; exit 1; fi
    actual="$(shasum -a 256 "$archive" | awk '{print $1}')"
  fi
  if [ "$actual" != "$expected" ]; then printf '%s\n' '安装包校验失败，未安装或运行。' >&2; exit 1; fi
  extract_dir="$(mktemp -d "$runtime_dir/.extract.XXXXXX")"
  trap 'rm -rf "$extract_dir"' EXIT
  ditto -x -k "$archive" "$extract_dir"
  codesign --verify --deep --strict "$extract_dir/Ollama.app"
  spctl --assess --type execute "$extract_dir/Ollama.app"
  if [ -e "$app" ]; then printf '%s\n' '目标位置已有 Ollama，未覆盖。' >&2; exit 1; fi
  mv "$extract_dir/Ollama.app" "$app"
  rm -f "$archive"
  rm -rf "$extract_dir"
  trap - EXIT
fi
codesign --verify --deep --strict "$app"
export OLLAMA_HOST='127.0.0.1:11434'
export OLLAMA_NO_CLOUD=1
export OLLAMA_MODELS="$runtime_dir/models"
"$cli" serve >"$runtime_dir/ollama.log" 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
ready=0
for unused in {1..30}; do
  if curl -fsS --max-time 1 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then ready=1; break; fi
  if ! kill -0 "$server_pid" 2>/dev/null; then break; fi
  sleep 1
done
if [ "$ready" != 1 ]; then kill "$server_pid" 2>/dev/null || true; printf '%s\n' '本地模型服务启动失败，请查看 runtime/ollama.log。' >&2; exit 1; fi
printf '%s\n' "正在下载中文模型 ${model}（约 1 GB），中断后可再次运行续传……"
if ! "$cli" pull "$model"; then kill "$server_pid" 2>/dev/null || true; printf '%s\n' '模型未下载完成，服务已停止；重试会继续使用已有文件。' >&2; exit 1; fi
printf '%s\n' "$server_pid" > "$runtime_dir/ollama.pid"
printf '%s\n' "本地模型服务已启动。请在工作台设置中点击“检测本地模型”，选中 $model 后保存。保持此窗口运行；关闭后可用 start-local-ai.sh 再次启动。"
wait "$server_pid"
