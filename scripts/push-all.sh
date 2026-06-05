#!/usr/bin/env bash
set -euo pipefail
git add .
git commit -m "${1:-Update StayInPoznan site}" || true
git push origin main || true
git push github main || true
