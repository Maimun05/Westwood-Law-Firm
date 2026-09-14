#!/usr/bin/env bash
# ============================================================================
# Render the presentation diagrams.
# ============================================================================
# docs/diagrams/src/*.html  ->  docs/diagrams/*.png
#
# Each source is a 1920x1080 (16:9) HTML page; it is screenshotted with
# headless Edge/Chrome at --force-device-scale-factor=2, so the PNGs come out
# 3840x2160 — sharp enough to drop straight into slides.
#
# The --virtual-time-budget gives the Google-Fonts stylesheet time to load
# before the screenshot is taken; without it the first render can fall back
# to system fonts.
#
# Usage: bash scripts/render-diagrams.sh [name ...]
#        (no args = render everything; or pass e.g. 03-erd to render one)
# ============================================================================
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO/docs/diagrams/src"
OUT="$REPO/docs/diagrams"

BROWSER=""
for c in \
  "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  "/c/Program Files/Microsoft/Edge/Application/msedge.exe" \
  "/c/Program Files/Google/Chrome/Application/chrome.exe" \
  "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"
do
  if [ -x "$c" ]; then BROWSER="$c"; break; fi
done
if [ -z "$BROWSER" ]; then
  echo "No Edge or Chrome found — install one or edit the BROWSER list." >&2
  exit 1
fi
echo "Using: $BROWSER"

render_one() {
  local html="$1"
  local base out profile
  base="$(basename "$html" .html)"
  out="$OUT/$base.png"

  # Fresh profile per render: without it Edge can serve a cached copy of the
  # page from the previous run and the PNG silently does not change.
  profile="$(mktemp -d)"

  "$BROWSER" \
    --headless=new --disable-gpu --hide-scrollbars --mute-audio \
    --no-first-run --no-default-browser-check \
    --user-data-dir="$(cygpath -w "$profile")" \
    --force-device-scale-factor=2 \
    --window-size=1920,1080 \
    --virtual-time-budget=10000 \
    --screenshot="$(cygpath -w "$out")" \
    "file:///$(cygpath -m "$html")" \
    >/dev/null 2>&1

  rm -rf "$profile"

  if [ -f "$out" ]; then
    local kb
    kb=$(( $(stat -c%s "$out") / 1024 ))
    echo "  ok  $base.png (${kb} KB)"
  else
    echo "  FAIL $base — no PNG produced"
    return 1
  fi
}

if [ "$#" -gt 0 ]; then
  FILES=()
  for name in "$@"; do FILES+=("$SRC/$name.html"); done
else
  FILES=("$SRC"/*.html)
fi

FAILED=0
for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "  skip $f (missing)"; FAILED=1; continue; }
  render_one "$f" || FAILED=1
done

exit "$FAILED"
