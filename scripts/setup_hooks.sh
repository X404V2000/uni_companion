#!/bin/sh
#
# scripts/setup_hooks.sh — enable the repository's commit guardrails.
#
# WHY THIS IS A SCRIPT AND NOT JUST A HOOK FILE
# ---------------------------------------------
# Git does not run hooks from a committed directory by default: `.git/hooks` is
# local to each clone. So the hooks live in `.githooks/` (committed, versioned,
# reviewable) and each clone points git at them with `core.hooksPath`.
#
# Run this once after cloning. Re-run it any time; it is idempotent.
#
# WHAT IT DOES NOT DO
# -------------------
# GitHub branch protection is unavailable here: the repo is private and
# protection requires GitHub Pro or a public repository. These hooks are a local
# guard against mistakes, not server-side enforcement. `--no-verify` bypasses
# them, and a fresh clone that has not run this script has no guard at all.

set -eu

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "Not inside a git repository." >&2
  exit 1
}

cd "$repo_root"

if [ ! -d .githooks ]; then
  echo "No .githooks/ directory found. Run this from the repository root." >&2
  exit 1
fi

chmod +x .githooks/pre-commit .githooks/pre-push
git config core.hooksPath .githooks

echo "Hooks enabled."
echo "  core.hooksPath = $(git config --get core.hooksPath)"
echo ""
echo "  pre-commit  blocks committing directly to 'main'"
echo "  pre-push    blocks pushing to 'main', force-pushing, and deleting a remote branch"
echo ""
echo "These are local guards only. See agents/README.md §7 for what they do and"
echo "do not protect against."
