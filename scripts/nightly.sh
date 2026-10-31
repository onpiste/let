#!/usr/bin/env bash
# The slow checks that don't run on every push, run on this Mac instead of on
# paid CI runners: iOS lint and simulator tests, the desktop build, and a
# TestFlight upload when the iOS app changed.
#
# It works in its own worktree on the latest origin/main, so your checkout and
# uncommitted changes are never touched, and skips a run when main hasn't
# moved since the last one.
#
#   scripts/nightly.sh            run once now
#   scripts/nightly.sh --force    run even if main hasn't changed
#   scripts/nightly.sh --install  run it at 09:00, 14:00 and 21:00 (launchd)
#   scripts/nightly.sh --uninstall
#
# Set COT_NIGHTLY_TESTFLIGHT=0 in ~/.config/cot/testflight.env to skip uploads.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
state="$HOME/.cache/cot-nightly"
tree="$state/worktree"
log="$HOME/Library/Logs/cot-nightly.log"
label="dev.cot.nightly"
plist="$HOME/Library/LaunchAgents/$label.plist"

notify() {
  osascript -e "display notification \"$1\" with title \"Cot nightly\"" || true
}

case "${1:-}" in
  --install)
    mkdir -p "$(dirname "$plist")" "$(dirname "$log")"
    hours=""
    for h in 9 14 21; do
      hours+="<dict><key>Hour</key><integer>$h</integer><key>Minute</key><integer>0</integer></dict>"
    done
    cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$repo/scripts/nightly.sh</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$PATH</string></dict>
  <key>StartCalendarInterval</key><array>$hours</array>
  <key>StandardOutPath</key><string>$log</string>
  <key>StandardErrorPath</key><string>$log</string>
</dict>
</plist>
PLIST
    launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$plist"
    echo "Installed $plist; logs go to $log."
    exit 0
    ;;
  --uninstall)
    launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
    rm -f "$plist"
    echo "Uninstalled."
    exit 0
    ;;
esac

mkdir -p "$state"
echo "=== $(date) ==="

git -C "$repo" fetch --quiet origin main
head=$(git -C "$repo" rev-parse origin/main)
last=$(cat "$state/last-checked" 2>/dev/null || true)
if [ "${1:-}" != "--force" ] && [ "$head" = "$last" ]; then
  echo "origin/main is still $head; nothing to do."
  exit 0
fi

git -C "$repo" worktree prune
if [ ! -d "$tree" ]; then
  git -C "$repo" worktree add --detach "$tree" "$head"
fi
cd "$tree"
git checkout --quiet --detach "$head"
git clean -fdx --quiet -e node_modules

# A failing step is reported but doesn't stop the others.
failed=()
step() {
  echo "--- $1"
  if ! (eval "$2"); then failed+=("$1"); fi
}

step "Install" "bun install --frozen-lockfile"
step "Desktop build" "bun run --filter @cot/desktop build"
step "Swift format" "cd apps/mobile && swiftformat --lint ."
# The other iOS steps need full Xcode (simctl, sourcekitd), not just the Command
# Line Tools; without it they are skipped and the TestFlight workflow's daily
# schedule uploads instead.
if xcrun --find simctl >/dev/null 2>&1; then
  step "Swift lint" "cd apps/mobile && swiftlint lint --strict"
  # Steps run inside `if`, where `set -e` is off, so chain them with &&.
  step "iOS tests" '
    cd apps/mobile && xcodegen generate &&
    device=$(xcrun simctl list devices available iPhone | grep -m1 -oE "[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}") &&
    xcodebuild test -quiet -project Cot.xcodeproj -scheme Cot \
      -destination "id=$device" CODE_SIGNING_ALLOWED=NO
  '

  # Upload only a green build whose iOS app changed since the last upload.
  config="$HOME/.config/cot/testflight.env"
  # shellcheck source=/dev/null
  [ -f "$config" ] && . "$config"
  uploaded=$(cat "$state/last-uploaded" 2>/dev/null || true)
  if [ "${COT_NIGHTLY_TESTFLIGHT:-1}" != 0 ] && [ ${#failed[@]} -eq 0 ] &&
    { [ -z "$uploaded" ] || ! git diff --quiet "$uploaded" "$head" -- apps/mobile; }; then
    step "TestFlight" "scripts/testflight.sh"
    if [ ${#failed[@]} -eq 0 ]; then echo "$head" > "$state/last-uploaded"; fi
  fi
else
  echo "--- iOS steps skipped: install Xcode to run them here."
fi

echo "$head" > "$state/last-checked"
if [ ${#failed[@]} -gt 0 ]; then
  notify "Failed on ${head:0:7}: ${failed[*]}. See $log"
  echo "Failed: ${failed[*]}"
  exit 1
fi
echo "All green on $head."
