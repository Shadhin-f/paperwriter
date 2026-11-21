#!/usr/bin/env sh
# Start PaperWriter. The first run installs what it needs and opens your browser.
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "PaperWriter needs Node.js 22.9 or newer: https://nodejs.org"
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Installing PaperWriter. This takes a minute the first time..."
  npm install --no-fund --no-audit
fi
PW_OPEN=1 exec npm start
