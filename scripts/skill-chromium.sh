#!/bin/sh
set -eu
petra_chrome="${PETRA_SKILLS_CHROME:-}"
if [ -z "$petra_chrome" ]; then
  for petra_candidate in /usr/bin/google-chrome /usr/bin/google-chrome-stable /usr/bin/chromium /usr/bin/chromium-browser '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' '/Applications/Chromium.app/Contents/MacOS/Chromium'; do
    if [ -x "$petra_candidate" ]; then petra_chrome="$petra_candidate"; break; fi
  done
fi
if [ -z "$petra_chrome" ] || [ ! -x "$petra_chrome" ]; then
  echo 'Install Chromium or set CHROME_PATH before running the skill tool.' >&2
  exit 127
fi
# Chromium cannot launch its sandbox as root. Ordinary users retain the sandbox.
if [ "$(id -u)" -eq 0 ]; then
  exec "$petra_chrome" --no-sandbox "$@"
fi
exec "$petra_chrome" "$@"
