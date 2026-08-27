#!/bin/bash
# verify-wider.sh — 用更宽阈值取候选并逐一 HTTPS 验证（含 0 速 IP）
awk -F, 'NR>1 && $4+0 == 0 {print $1}' /tmp/cfst_linux_amd64/result.csv > /tmp/candidates.txt
echo "--- total candidates: $(wc -l < /tmp/candidates.txt) ---"
ok=0
> /tmp/verified-ok.txt
while read -r ip; do
  code=$(curl -4 -s -o /dev/null -w '%{http_code}' --resolve "toapis.com:443:$ip" --connect-timeout 4 -m 8 https://toapis.com/v1)
  if [[ "$code" =~ ^[1-5] ]]; then
    echo "OK  $ip -> $code"
    echo "$ip" >> /tmp/verified-ok.txt
    ok=$((ok+1))
    [[ $ok -ge 5 ]] && break
  else
    echo "BAD $ip -> $code"
  fi
done < /tmp/candidates.txt
echo "--- verified OK list ---"
cat /tmp/verified-ok.txt
