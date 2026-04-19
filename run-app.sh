#!/bin/bash
export PATH="/usr/local/bin:$PATH"
cd "$(dirname "$0")"
exec /usr/local/bin/node node_modules/electron/dist/electron.app/Contents/MacOS/Electron .
