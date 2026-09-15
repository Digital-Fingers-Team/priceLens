#!/usr/bin/env bash
# Move the working branch from the local bare hub out to GitHub.
#
# The deploy checkout has the branch checked out, so it cannot be pushed into
# directly (git refuses to update a checked-out branch). Work therefore lands
# in ~/pricelens-hub.git first; this fast-forwards the checkout to it and
# pushes on to origin.
#
# NOTE: this deliberately uses `merge --ff-only`, NOT `reset --hard`.
# `reset --hard` rewrites every tracked file, which on this checkout meant
# reverting runtime-managed config and replacing bind-mounted files by rename
# -- that took the site down. --ff-only touches only what actually changed and
# refuses outright if the checkout has diverged, rather than silently
# discarding it.
set -euo pipefail

BRANCH="${1:-feat/price-intelligence-platform}"
HUB="$HOME/pricelens-hub.git"

cd ~/pricelens

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "refusing to sync: the deploy checkout has uncommitted changes" >&2
  git status --short >&2
  exit 1
fi

git fetch -q "$HUB" "$BRANCH"

if ! git merge --ff-only FETCH_HEAD; then
  echo "refusing to sync: $BRANCH has diverged from the hub." >&2
  echo "Reconcile by hand -- a forced reset here has caused an outage before." >&2
  exit 1
fi

git push -q origin "$BRANCH"
echo "pushed $(git rev-parse --short HEAD) ($BRANCH) to GitHub"
