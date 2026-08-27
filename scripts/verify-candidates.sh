#!/bin/bash
# verify-candidates.sh — 批量验证候选 IP 的 HTTPS 可达性
awk -F, 'NR>1 && $6+0 >= 0.3 {print $1}' /tmp/cfst_linux_amd64/result.csv | head -6 > /tmp/candidates.txt
echo "--- candidates ---"
cat /tmp/candidates.txt
echo "--- verify ---"
while read -r ip; do
  code=$(curl -4 -s -o /dev/null -w '%{http_code}' --resolve "toapis.com:443:$ip" --connect-timeout 6 https://toapis.com/v1)
  echo "$ip -> $code"
done < /tmp/candidates.txt
