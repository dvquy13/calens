#!/usr/bin/env bash
# verify-red.sh: prove a regression test is "red then green".
#
# Runs <test command> once with the <ref> version of the given files in place
# (old code, expected to FAIL), then restores the current files and runs the
# command again (current code, expected to PASS).
#
# Current files are backed up before anything is touched, and a trap restores
# them on EXIT/INT/TERM. Ctrl-C (whole process group) stops the test and
# restores. A signal sent only to this script is acted on once the running test
# command exits. SIGKILL cannot be trapped: then restore the files from the
# backup dir printed at the start.
#
# Usage (run from the repo root; paths are relative to it):
#   scripts/verify-red.sh [--ref <git-ref>] [--rebuild] <file>... -- <test command...>
#
# Examples:
#   scripts/verify-red.sh src/hooks/fetch-with-sync-retry.ts -- npx vitest run src/hooks/fetch-with-sync-retry.test.ts
#   scripts/verify-red.sh --ref f05114d^ src/hooks/useEventData.ts -- npm run test:e2e -- -g "recovers"
#
# --rebuild runs `npm run build-dev` after restoring, so dist/ is not left built
# from old code. For E2E use `npm run test:e2e -- ...` (it builds first);
# plain `npx playwright test` does not rebuild dist.
# A file missing at <ref> is treated as new in the fix: it is moved aside for the
# red run and moved back afterwards.

set -euo pipefail

die() { echo "error: $*" >&2; exit 2; }

REF=main
REBUILD=0
FILES=()
while [[ $# -gt 0 && "$1" != "--" ]]; do
  case "$1" in
    --ref) [[ $# -ge 2 ]] || die "--ref needs a value"; REF="$2"; shift 2 ;;
    --rebuild) REBUILD=1; shift ;;
    -*) die "unknown option: $1" ;;
    *) FILES+=("$1"); shift ;;
  esac
done
[[ "${1:-}" == "--" ]] || die "expected '--' before the test command"
shift
[[ ${#FILES[@]} -gt 0 ]] || die "no files given"
[[ $# -gt 0 ]] || die "no test command after '--'"
CMD=("$@")
[[ -f package.json && -d src ]] || die "run from the repo root"

EXISTS=()
for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || die "no such file in working tree: $f"
  if git cat-file -e "$REF:./$f" 2>/dev/null; then
    if git diff --quiet "$REF" -- "$f"; then
      echo "unchanged vs $REF: $f" >&2
      exit 2
    fi
    EXISTS+=(1)
  else
    EXISTS+=(0)
  fi
done

BEFORE=$(git status --short -- "${FILES[@]}")
BACKUP=$(mktemp -d)
echo "backup dir: $BACKUP"
for i in "${!FILES[@]}"; do
  if [[ ${EXISTS[$i]} == 1 ]]; then cp -p "${FILES[$i]}" "$BACKUP/$i"; fi
done

# Restores every file from $BACKUP. Idempotent: a no-op once the backup dir is gone.
restore() {
  [[ -d "$BACKUP" ]] || return 0
  local i f ok=1
  for i in "${!FILES[@]}"; do
    f="${FILES[$i]}"
    if [[ ${EXISTS[$i]} == 1 ]]; then
      if ! { cp -p "$BACKUP/$i" "$f" && cmp -s "$BACKUP/$i" "$f"; }; then
        echo "RESTORE FAILED: $f (backup: $BACKUP/$i)" >&2; ok=0
      fi
    elif [[ -e "$BACKUP/$i" && ! -e "$f" ]]; then
      mv "$BACKUP/$i" "$f" || { echo "RESTORE FAILED: $f (backup: $BACKUP/$i)" >&2; ok=0; }
    fi
  done
  [[ $ok == 1 ]] || return 1
  rm -rf "$BACKUP"
}
trap restore EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for i in "${!FILES[@]}"; do
  f="${FILES[$i]}"
  if [[ ${EXISTS[$i]} == 1 ]]; then git show "$REF:./$f" > "$f"; else mv "$f" "$BACKUP/$i"; fi
done

echo "== RED: $REF version in place, running: ${CMD[*]}"
RED_RC=0
"${CMD[@]}" || RED_RC=$?

echo "== restoring current files"
restore || exit 1

if [[ $REBUILD == 1 ]]; then
  echo "== npm run build-dev"
  npm run build-dev || die "build-dev failed"
fi

echo "== GREEN: current code, running: ${CMD[*]}"
GREEN_RC=0
"${CMD[@]}" || GREEN_RC=$?

echo
[[ $RED_RC -ne 0 ]] && RED_OK=1 || RED_OK=0
[[ $GREEN_RC -eq 0 ]] && GREEN_OK=1 || GREEN_OK=0
if [[ $RED_OK == 1 ]]; then echo "RED (old code): FAIL as expected (exit $RED_RC)"; else echo "RED (old code): UNEXPECTED PASS"; fi
if [[ $GREEN_OK == 1 ]]; then echo "GREEN (current code): PASS"; else echo "GREEN (current code): FAIL (exit $GREEN_RC)"; fi
AFTER=$(git status --short -- "${FILES[@]}")
echo "git status --short -- ${FILES[*]}:"
echo "${AFTER:-(clean)}"
[[ "$AFTER" == "$BEFORE" ]] || { echo "WARNING: status differs from before the run" >&2; exit 1; }

if [[ $RED_OK == 1 && $GREEN_OK == 1 ]]; then exit 0; fi
exit 1
