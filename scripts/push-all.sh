#!/usr/bin/env bash
set -euo pipefail

branch="$(git branch --show-current)"
if [[ -z "$branch" || "$branch" == "main" ]]; then
  echo "Refusing to push an unnamed branch or main." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Worktree is not clean. Review, stage and commit exact files first." >&2
  exit 1
fi

node scripts/build.mjs
node scripts/check-site.mjs

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Generated output differs from the commit. Commit it before pushing." >&2
  exit 1
fi

git push --set-upstream origin "$branch"
