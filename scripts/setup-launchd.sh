#!/usr/bin/env bash
set -euo pipefail

# Installs the local vault sync agent.
#
# Daily file/briefing generation lives in .github/workflows/daily-cron.yml and
# runs on GitHub — it commits straight to the repo. Nothing pulls those commits
# back down, so Obsidian (which reads the working tree) silently falls behind.
# This agent closes that loop and does nothing else; running the generator
# locally as well would double-write the same files.

REPO="$(cd "$(dirname "$0")/.."; pwd)"
GIT="$(which git)"
PLIST="$HOME/Library/LaunchAgents/com.secondbrain.sync.plist"
OLD_PLIST="$HOME/Library/LaunchAgents/com.secondbrain.morning.plist"

# The old 7:00 AM generator agent hard-coded a repo path that broke when the
# project moved. It has been failing with MODULE_NOT_FOUND every morning since;
# retire it rather than leaving a job that only writes to the error log.
if [ -f "$OLD_PLIST" ]; then
  launchctl unload "$OLD_PLIST" 2>/dev/null || true
  rm -f "$OLD_PLIST"
  echo "Removed retired agent: com.secondbrain.morning"
fi

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.secondbrain.sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>$GIT</string>
        <string>-C</string>
        <string>$REPO</string>
        <string>pull</string>
        <string>--rebase</string>
        <string>--autostash</string>
    </array>
    <key>StartInterval</key>
    <integer>900</integer>
    <key>StandardOutPath</key>
    <string>/tmp/secondbrain-sync.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/secondbrain-sync.log</string>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "Vault sync installed for $REPO"
echo "Pulls every 15 minutes. Log: /tmp/secondbrain-sync.log"
