#!/usr/bin/env bash
for h in toapis.com files.toapis.com api.toapis.com www.cloudflare.com; do
  code=$(curl -4 -s -o /dev/null -w '%{http_code}' --connect-timeout 6 "https://$h/" 2>/dev/null)
  echo "$h -> $code"
done
