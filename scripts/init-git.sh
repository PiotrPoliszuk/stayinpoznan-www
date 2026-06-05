#!/usr/bin/env bash
set -euo pipefail
git init
git branch -M main
git add .
git commit -m "Initial StayInPoznan landing page"
echo
echo "Now add remotes, for example:"
echo "  git remote add origin ssh://git@10.2.0.5:2222/piotr/stayinpoznan-www.git"
echo "  git remote add github git@github.com:ppiotr1984/stayinpoznan-www.git"
echo "  git push -u origin main"
echo "  git push -u github main"
