#!/bin/bash
set -eu

LABEL="com.whm.creator-studio"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(/usr/bin/id -u)"

/bin/launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
/bin/rm -f "$PLIST"
/bin/echo "已移除创作者工作台自动启动项。"
