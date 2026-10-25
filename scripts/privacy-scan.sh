#!/usr/bin/env bash
# 隐私泄露扫描: 推送前必跑, 任何命中以非零退出。
# 禁止模式来自仓库根目录的 .privacy-local.txt(仅存在于本地, 永不入库; 缺省时跳过)。
# 引擎本身不含任何真实隐私值, 可安全提交。
# 用法: bash scripts/privacy-scan.sh
set -u
cd "$(dirname "$0")/.."
fail=0

# 1) 本地禁止清单(姓名/账号/密码/订阅标识等, 一行一条)
if [ -f .privacy-local.txt ]; then
  while IFS= read -r pat; do
    [ -z "$pat" ] && continue
    case "$pat" in \#*) continue ;; esac
    hits=$(grep -rniF -e "$pat" --exclude-dir=.git --exclude=.privacy-local.txt --exclude=privacy-scan.sh . || true)
    if [ -n "$hits" ]; then
      echo "[LEAK] 命中本地禁止清单: $pat"
      echo "$hits"
      fail=1
    fi
  done < .privacy-local.txt
else
  echo "[WARN] 无 .privacy-local.txt, 跳过个人标识检查(该文件仅本地创建, 已被 .gitignore 排除)"
fi

# 2) 邮箱白名单: 仅允许 GitHub noreply 地址
emails=$(grep -rhoE '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b' . --exclude-dir=.git --exclude=.privacy-local.txt --exclude=privacy-scan.sh | sort -u)
while IFS= read -r e; do
  [ -z "$e" ] && continue
  case "$e" in
    *users.noreply.github.com) ;;
    *) echo "[LEAK] 非白名单邮箱: $e"; fail=1 ;;
  esac
done <<< "$emails"

# 3) IPv4 白名单: 仅保留段与公共 DNS
ips=$(grep -rhoE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' . --exclude-dir=.git --exclude=.privacy-local.txt | sort -u)
while IFS= read -r ip; do
  [ -z "$ip" ] && continue
  case "$ip" in
    0.0.0.0|127.*|10.*|192.168.*|198.18.*|198.19.*|1.1.1.1|8.8.8.8|223.5.5.5|119.29.29.29|1.12.12.12) ;;
    203.0.113.*) ;;
    172.1[6-9].*|172.2*|172.3[01].*) ;;
    *) echo "[LEAK] 非白名单 IP: $ip"; fail=1 ;;
  esac
done <<< "$ips"

# 4) git 元数据: 所有分支的作者/提交者邮箱必须为 noreply
bad_meta=$(git log --all --format='%ae%n%ce' | grep -v 'users.noreply.github.com' || true)
if [ -n "$bad_meta" ]; then
  echo "[LEAK] git 元数据含非 noreply 邮箱:"
  echo "$bad_meta"
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "[OK] 隐私扫描通过"
else
  echo "[FAIL] 存在泄露风险, 禁止推送"
fi
exit $fail
