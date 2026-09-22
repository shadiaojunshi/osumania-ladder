#!/usr/bin/env bash
set -euo pipefail
# Only used in Actions. No force push and no automatic conflict resolution.
for file in "$@"; do
  case "$file" in
    data/packs-manifest.json|data/pack-csv-manifest.json) ;;
    *) echo "Unexpected publish path: $file" >&2; exit 2 ;;
  esac
done
git config user.name 'github-actions[bot]'
git config user.email 'github-actions[bot]@users.noreply.github.com'
git add -- "$@"
if git diff --cached --quiet; then exit 0; fi
git commit -m 'Update pack download metadata'
for attempt in 1 2 3; do
  if git push; then exit 0; fi
  git fetch origin "${GITHUB_REF_NAME}"
  if ! git rebase "origin/${GITHUB_REF_NAME}"; then
    git rebase --abort || true
    echo '::error::下载清单与远端修改冲突。停止发布，结果已作为 artifact 保留，请人工合并；绝不覆盖人工链接。'
    exit 1
  fi
done
echo '::error::推送失败；结果保留在 artifact 中。'
exit 1
