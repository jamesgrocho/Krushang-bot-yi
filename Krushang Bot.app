#!/bin/bash
cd "$(dirname "$0")"
export PATH="/usr/local/bin:$PATH"
/usr/local/bin/node ./node_modules/.bin/electron . > /dev/null 2>&1
