#!/usr/bin/env bash
# Fails if tracked source files contain patterns typical of injected
# malware loaders — the kind that hid in this repo's commit 7913b3a:
# code pushed off-screen with whitespace, eval of decoded strings, and
# minified-length lines in hand-written source.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

mapfile -t files < <(git ls-files -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.json' '*.rs' '*.html' '*.sh' '*.yml' \
  | grep -v -E '(^|/)(package-lock\.json|Cargo\.lock)$')

status=0
report() { echo "::error file=$1::$2"; status=1; }

for f in "${files[@]}"; do
  [ -f "$f" ] || continue
  # Pure SVG path data (d="M12 2.25a.75…") is the one legitimate long-line case.
  if awk 'length > 500 && $0 !~ /^[ \t]*d="[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+"[ \t]*\/?>?[ \t]*$/ { found=1; exit } END { exit !found }' "$f"; then
    report "$f" "line longer than 500 characters (possible hidden payload)"
  fi
  if grep -nE '[^[:space:]][ \t]{80,}[^[:space:]]' "$f" >/dev/null; then
    report "$f" "code hidden behind a long run of whitespace"
  fi
  if grep -nE 'eval\(|new Function\(|Function\([^)]*\)\(\)|atob\(.{200,}' "$f" | grep -v 'check-source-integrity' >/dev/null; then
    report "$f" "dynamic code evaluation (eval / Function constructor / large atob)"
  fi
done

if [ "$status" -eq 0 ]; then echo "Source integrity check passed (${#files[@]} files)."; fi
exit "$status"
