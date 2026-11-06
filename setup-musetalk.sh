#!/bin/bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MUSE_HOME="${MUSETALK_HOME:-$APP_ROOT/../musetalk-mac}"
MUSE_HOME="$(cd "$MUSE_HOME" 2>/dev/null && pwd)" || {
  /bin/echo "找不到 MuseTalk 项目：${MUSETALK_HOME:-$APP_ROOT/../musetalk-mac}" >&2
  /bin/echo "请先准备 Apple Silicon MuseTalk 项目，再设置 MUSETALK_HOME 指向它。" >&2
  exit 1
}
PYTHON="$MUSE_HOME/.venv/bin/python"
REQUIREMENTS="$MUSE_HOME/requirements-mac.txt"
MODEL_ROOT="$MUSE_HOME/upstream/models"
PIP_INDEX_URL="${MUSETALK_PIP_INDEX_URL:-https://pypi.org/simple}"

if [ ! -x "$PYTHON" ] || [ ! -f "$REQUIREMENTS" ]; then
  /bin/echo "MuseTalk 虚拟环境或 requirements-mac.txt 不完整：$MUSE_HOME" >&2
  exit 1
fi
for model in \
  "$MODEL_ROOT/musetalkV15/unet.pth" \
  "$MODEL_ROOT/sd-vae/diffusion_pytorch_model.bin" \
  "$MODEL_ROOT/whisper/pytorch_model.bin" \
  "$MODEL_ROOT/face-parse-bisent/79999_iter.pth" \
  "$MODEL_ROOT/yunet/face_detection_yunet_2023mar.onnx"; do
  if [ ! -s "$model" ]; then
    /bin/echo "缺少已下载模型文件：$model" >&2
    exit 1
  fi
done

/bin/echo "只在 MuseTalk 专用虚拟环境中安装 Python 推理依赖；不下载模型权重。"
FILTERED_REQUIREMENTS="$(/usr/bin/mktemp)"
trap '/bin/rm -f "$FILTERED_REQUIREMENTS"' EXIT
/usr/bin/awk '
  {
    requirement = tolower($0)
    if (requirement ~ /^[[:space:]]*gradio([[:space:]<=>!~]|$)/) next
    print
  }
' "$REQUIREMENTS" > "$FILTERED_REQUIREMENTS"
/bin/echo "跳过上游 Gradio 演示界面依赖；创作者工作台使用已集成的本地界面。"
"$PYTHON" -m pip install --no-cache-dir --retries 10 --resume-retries 10 --timeout 180 --prefer-binary --index-url "$PIP_INDEX_URL" -r "$FILTERED_REQUIREMENTS"
/bin/echo "依赖安装完成。返回创作者工作台视频工坊，点击“重新检测环境”。"
