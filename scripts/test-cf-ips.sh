#!/usr/bin/env bash
# 遍历 result.csv 中的候选 IP，找到第一个真正可用的
while IFS=, read -r ip sent recv loss delay speed region; do
  [[ "$ip" == "IP"* ]] && continue
  code=$(curl -4 -s -o /dev/null -w '%{http_code}' --resolve "toapis.com:443:$ip" --connect-timeout 6 https://toapis.com/v1)
  echo "$ip speed=$speed -> HTTP $code"
  if [[ "$code" =~ ^[1-5] ]]; then
    echo "BEST=$ip"
    exit 0
  fi
done < /tmp/cfst_linux_amd64/result.csv
echo "BEST=NONE"
exit 1
