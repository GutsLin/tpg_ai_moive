#!/usr/bin/env bash
# cf-auto-switch.sh — Cloudflare IP 自动健康检查与切换
# cron 每 10 分钟执行：当前 IP 不通时自动跑 cfst 测速，换最优 IP 并更新 /etc/hosts
set -uo pipefail

TOAPIS_HOSTS=("toapis.com" "files.toapis.com")
CFST_DIR="/tmp/cfst_linux_amd64"
RESULT_CSV="$CFST_DIR/result.csv"
LOG_TAG="cf-auto-switch"
CHECK_URL="https://toapis.com/v1"
TIMEOUT=8
MIN_SPEED=1.0   # 候选 IP 下载速度下限 MB/s

log() { logger -t "$LOG_TAG" "$*"; echo "$(date '+%F %T') $*"; }

current_ip() { awk '$2=="toapis.com"{print $1}' /etc/hosts | tail -1; }

check_ip() {
  # $1 = 待检测 IP；返回 0 = 可用
  curl -4 -s -o /dev/null -w '%{http_code}' \
    --resolve "toapis.com:443:$1" --connect-timeout "$TIMEOUT" "$CHECK_URL" \
    | grep -qE '^[1-5]'
}

update_hosts() {
  # $1 = 新 IP
  local new_ip="$1"
  cp /etc/hosts "/etc/hosts.bak.$(date +%s)"
  for h in "${TOAPIS_HOSTS[@]}"; do
    sed -i "/[[:space:]]$h\$/d" /etc/hosts
    echo "$new_ip $h" >> /etc/hosts
  done
}

pick_best_ip() {
  # 跑 cfst，输出第一个速度达标的 IP
  cd "$CFST_DIR" || return 1
  timeout 300 ./cfst -tl 200 -dn 5 -p 20 >/dev/null 2>&1
  awk -F, 'NR>1 && $6+0 >= '"$MIN_SPEED"' {print $1; exit}' "$RESULT_CSV"
}

main() {
  local ip
  ip="$(current_ip)"

  if [[ -z "$ip" ]]; then
    log "WARN /etc/hosts 中未找到 toapis.com 记录，将执行首次配置"
  elif check_ip "$ip"; then
    log "OK 当前 IP $ip 可用"
    exit 0
  else
    log "WARN 当前 IP $ip 不可用，开始重新测速"
  fi

  local best
  best="$(pick_best_ip)"
  if [[ -z "$best" ]]; then
    log "ERROR cfst 未找到达标 IP，保持现状"
    exit 1
  fi

  if ! check_ip "$best"; then
    log "ERROR 候选 IP $best 二次校验失败，保持现状"
    exit 1
  fi

  update_hosts "$best"
  log "INFO 已切换 toapis.com -> $best"

  # 重启依赖 hosts 的容器（compose 文件中的 extra_hosts 需同步更新）
  local compose_dir="/opt/narrix/releases/20260821-prod-apikey-config"
  if [[ -f "$compose_dir/deploy/docker-compose.yml" ]]; then
    sed -i "s/- \"toapis.com:[0-9.]*\"/- \"toapis.com:$best\"/g; s/- \"files.toapis.com:[0-9.]*\"/- \"files.toapis.com:$best\"/g" \
      "$compose_dir/deploy/docker-compose.yml"
    cd "$compose_dir" || { log "ERROR 无法进入 $compose_dir"; exit 1; }
    set -a; . /opt/narrix/env/prod/stack.env; set +a
    export NARRIX_IMAGE_TAG=20260821-prod-apikey-config
    docker compose -f deploy/docker-compose.yml --env-file /opt/narrix/env/prod/stack.env \
      up -d backend worker-video worker-asset-sync worker-atelier-image >/dev/null 2>&1 \
      && log "INFO 容器已用新 IP 重建" \
      || log "ERROR 容器重建失败，请人工检查"
  else
    log "WARN 未找到 compose 目录，仅更新了 /etc/hosts"
  fi
}

main "$@"
