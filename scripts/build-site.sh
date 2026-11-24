#!/usr/bin/env bash
# Assemble the deployable static site into _site/.
# Used by both the GitHub Pages and the Cloudflare deployment so the list of
# shipped files lives in exactly one place.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf _site
mkdir _site
cp -r index.html index.js style.css manifest.json sw.js images model store io ui _site/
# Cloudflare-specific header rules (ignored by GitHub Pages).
cp _headers _site/
