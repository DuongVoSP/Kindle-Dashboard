#!/bin/bash
# Run the dashboard automatically at login (launchd), restarting it if it dies.
# Usage: ./service.sh install | uninstall | restart | status
set -euo pipefail

LABEL="local.kindle-dashboard"
PORT="${PORT:-7972}"
DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/kindle-dashboard.log"
DOMAIN="gui/$(id -u)"

# Prefer the system-wide Node over version-manager or app-bundled ones.
find_node() {
  for n in /usr/local/bin/node /opt/homebrew/bin/node "$(command -v node || true)"; do
    [ -n "$n" ] && [ -x "$n" ] && { echo "$n"; return; }
  done
  echo "node not found" >&2
  exit 1
}

unload() {
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || return 0
  # bootout returns before the job is gone; bootstrap fails until it is
  for _ in $(seq 1 50); do
    launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 || return 0
    sleep 0.2
  done
}

case "${1:-}" in
  install)
    NODE="$(find_node)"
    CLAUDE="$(command -v claude || echo "$HOME/.local/bin/claude")"
    mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
    unload
    cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$DIR/server.js</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>$PORT</string>
    <key>CLAUDE_BIN</key><string>$CLAUDE</string>
    <key>PATH</key><string>$(dirname "$CLAUDE"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST_EOF
    plutil -lint -s "$PLIST"
    launchctl bootstrap "$DOMAIN" "$PLIST"
    echo "Installed. Open http://$(scutil --get LocalHostName).local:$PORT"
    ;;
  uninstall)
    unload
    rm -f "$PLIST"
    echo "Uninstalled."
    ;;
  restart)
    launchctl kickstart -k "$DOMAIN/$LABEL"
    ;;
  status)
    launchctl print "$DOMAIN/$LABEL" | grep -E '^\s(state|pid|last exit code)' || true
    tail -n 5 "$LOG" 2>/dev/null || true
    ;;
  *)
    echo "Usage: $0 install | uninstall | restart | status" >&2
    exit 1
    ;;
esac
