#!/bin/bash
set -euo pipefail
studio_dir="$(cd "$(dirname "$0")" && pwd)"
runtime_dir="$studio_dir/runtime"
cli="$runtime_dir/Ollama.app/Contents/Resources/ollama"
if [ ! -x "$cli" ]; then printf '%s\n' '尚未安装 Ollama，请先运行 setup-local-ai.sh。' >&2; exit 1; fi
if lsof -nP -iTCP:11434 -sTCP:LISTEN >/dev/null 2>&1; then printf '%s\n' '端口 11434 已被占用；不会启动第二个服务或切换端口。' >&2; exit 1; fi
export OLLAMA_HOST='127.0.0.1:11434'
export OLLAMA_MODELS="$runtime_dir/models"
export OLLAMA_NO_CLOUD=1
export OLLAMA_CONTEXT_LENGTH=4096
printf '%s\n' "$$" > "$runtime_dir/ollama.pid"
exec "$cli" serve
