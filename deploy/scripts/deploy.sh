#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${NARRIX_DEPLOY_ROOT:-/opt/narrix}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
CURRENT_ROOT="${APP_ROOT}/current"

ENV_NAME="$1"
RELEASE_REF="${2:-manual}"
IMAGE_TAG="${3:-${ENV_NAME}-local}"
COMPOSE_FILE="${RELEASE_ROOT}/docker-compose.yml"
PREVIOUS_RELEASE=""
PREVIOUS_COMPOSE_FILE=""

log_phase() {
  local event="$1"
  shift
  echo "[narrix-deploy] ${event} $*"
}

wait_for_http() {
  local service_name="$1"
  local url="$2"
  local max_attempts="${3:-30}"
  local sleep_seconds="${4:-2}"
  local attempt=1

  while (( attempt <= max_attempts )); do
    if curl --fail --silent "$url" >/dev/null; then
      echo "Health check passed for ${service_name}: ${url}"
      return 0
    fi

    echo "Waiting for ${service_name} health (${attempt}/${max_attempts}): ${url}" >&2
    sleep "$sleep_seconds"
    attempt=$((attempt + 1))
  done

  echo "Health check failed for ${service_name}: ${url}" >&2
  return 1
}

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

rollback_compose() {
  docker compose -f "$PREVIOUS_COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

wait_for_compose_health_with() {
  local compose_runner="$1"
  local service_name="$2"
  local max_attempts="${3:-30}"
  local sleep_seconds="${4:-2}"
  local attempt=1
  local container_id
  local status

  while (( attempt <= max_attempts )); do
    container_id="$($compose_runner ps -q "$service_name" 2>/dev/null || true)"

    if [[ -n "$container_id" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      if [[ "$status" == "healthy" || "$status" == "running" ]]; then
        echo "Compose service ${service_name} is ${status}"
        return 0
      fi
    fi

    echo "Waiting for compose service ${service_name} (${attempt}/${max_attempts})" >&2
    sleep "$sleep_seconds"
    attempt=$((attempt + 1))
  done

  echo "Compose service ${service_name} failed to become healthy" >&2
  return 1
}

wait_for_compose_health() {
  local service_name="$1"
  local max_attempts="${2:-30}"
  local sleep_seconds="${3:-2}"
  wait_for_compose_health_with compose "$service_name" "$max_attempts" "$sleep_seconds"
}

run_migrations() {
  local max_attempts="${1:-3}"
  local sleep_seconds="${2:-3}"
  local attempt=1
  local run_name="${NARRIX_COMPOSE_PROJECT_NAME}-${ENV_NAME}-migrate-run"

  while (( attempt <= max_attempts )); do
    docker rm -f "${run_name}" >/dev/null 2>&1 || true

    if compose run --name "${run_name}" --no-deps migrate; then
      docker rm -f "${run_name}" >/dev/null 2>&1 || true
      return 0
    fi

    echo "Migration attempt ${attempt}/${max_attempts} failed" >&2
    docker logs "${run_name}" --tail=100 || true
    docker rm -f "${run_name}" >/dev/null 2>&1 || true

    if (( attempt < max_attempts )); then
      sleep "$sleep_seconds"
    fi

    attempt=$((attempt + 1))
  done

  return 1
}

print_failure_logs() {
  compose ps || true
  compose logs frontend --tail=100 || true
  compose logs backend --tail=100 || true
}

print_rollback_failure_logs() {
  rollback_compose ps || true
  rollback_compose logs frontend --tail=100 || true
  rollback_compose logs backend --tail=100 || true
}

rollback_to_previous_release() {
  if [[ -z "$PREVIOUS_RELEASE" || ! -d "$PREVIOUS_RELEASE" ]]; then
    log_phase "ROLLBACK_SKIPPED_NO_PREVIOUS_RELEASE" "env=${ENV_NAME}"
    return 1
  fi

  PREVIOUS_COMPOSE_FILE="${PREVIOUS_RELEASE}/docker-compose.yml"

  if [[ ! -f "$PREVIOUS_COMPOSE_FILE" ]]; then
    log_phase "ROLLBACK_FAILED" "reason=missing_previous_compose env=${ENV_NAME} path=${PREVIOUS_COMPOSE_FILE}"
    return 1
  fi

  log_phase "ROLLBACK_STARTED" "env=${ENV_NAME}"
  log_phase "ROLLBACK_TARGET" "env=${ENV_NAME} path=${PREVIOUS_RELEASE} image_tag=${NARRIX_IMAGE_TAG:-unknown} release_ref=${NARRIX_RELEASE_REF:-unknown}"

  rollback_compose build backend frontend
  rollback_compose up -d --no-build postgres redis

  if ! wait_for_compose_health_with rollback_compose "postgres"; then
    print_rollback_failure_logs
    log_phase "ROLLBACK_FAILED" "reason=postgres_unhealthy env=${ENV_NAME}"
    return 1
  fi

  if ! wait_for_compose_health_with rollback_compose "redis"; then
    print_rollback_failure_logs
    log_phase "ROLLBACK_FAILED" "reason=redis_unhealthy env=${ENV_NAME}"
    return 1
  fi

  rollback_compose up -d --no-build backend frontend worker-video worker-asset-sync worker-atelier-image
  rollback_compose ps

  if ! wait_for_http "frontend" "http://127.0.0.1:${FRONTEND_PORT}/health"; then
    print_rollback_failure_logs
    log_phase "ROLLBACK_FAILED" "reason=frontend_healthcheck env=${ENV_NAME}"
    return 1
  fi

  if ! wait_for_http "backend" "http://127.0.0.1:${BACKEND_PORT}/health"; then
    print_rollback_failure_logs
    log_phase "ROLLBACK_FAILED" "reason=backend_healthcheck env=${ENV_NAME}"
    return 1
  fi

  mkdir -p "$CURRENT_ROOT"
  ln -sfn "$PREVIOUS_RELEASE" "${CURRENT_ROOT}/${ENV_NAME}"
  log_phase "ROLLBACK_SUCCEEDED" "env=${ENV_NAME} path=${PREVIOUS_RELEASE}"
  return 0
}

case "$ENV_NAME" in
  dev)
    ENV_FILE="${NARRIX_DEV_ENV_FILE:-$APP_ROOT/env/dev/stack.env}"
    DEFAULT_FRONTEND_PORT=18080
    DEFAULT_BACKEND_PORT=13000
    ;;
  prod)
    ENV_FILE="${NARRIX_PROD_ENV_FILE:-$APP_ROOT/env/prod/stack.env}"
    DEFAULT_FRONTEND_PORT=8080
    DEFAULT_BACKEND_PORT=3000
    ;;
  *)
    echo "Unsupported environment: $ENV_NAME, expected dev or prod" >&2
    exit 1
    ;;
esac

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

if [[ -L "${CURRENT_ROOT}/${ENV_NAME}" || -e "${CURRENT_ROOT}/${ENV_NAME}" ]]; then
  PREVIOUS_RELEASE="$(readlink "${CURRENT_ROOT}/${ENV_NAME}" 2>/dev/null || true)"
fi

cd "$RELEASE_ROOT"

set -a
. "$ENV_FILE"
set +a

export NARRIX_IMAGE_TAG="$IMAGE_TAG"
export NARRIX_RELEASE_REF="$RELEASE_REF"
FRONTEND_PORT="${NARRIX_FRONTEND_PORT:-$DEFAULT_FRONTEND_PORT}"
BACKEND_PORT="${NARRIX_BACKEND_PORT:-$DEFAULT_BACKEND_PORT}"

log_phase "DEPLOY_STARTED" "env=${ENV_NAME} release_root=${RELEASE_ROOT} image_tag=${IMAGE_TAG} release_ref=${RELEASE_REF} previous_release=${PREVIOUS_RELEASE:-none}"

compose build backend frontend
compose up -d --no-build postgres redis

if ! wait_for_compose_health "postgres"; then
  print_failure_logs
  log_phase "DEPLOY_FAILED" "reason=postgres_unhealthy env=${ENV_NAME}"
  if rollback_to_previous_release; then
    log_phase "DEPLOY_ROLLED_BACK" "env=${ENV_NAME} reason=postgres_unhealthy"
  fi
  exit 1
fi

if ! wait_for_compose_health "redis"; then
  print_failure_logs
  log_phase "DEPLOY_FAILED" "reason=redis_unhealthy env=${ENV_NAME}"
  if rollback_to_previous_release; then
    log_phase "DEPLOY_ROLLED_BACK" "env=${ENV_NAME} reason=redis_unhealthy"
  fi
  exit 1
fi

if ! run_migrations; then
  print_failure_logs
  log_phase "DEPLOY_FAILED" "reason=migrate_failed env=${ENV_NAME}"
  if rollback_to_previous_release; then
    log_phase "DEPLOY_ROLLED_BACK" "env=${ENV_NAME} reason=migrate_failed"
  fi
  exit 1
fi

compose up -d --no-build backend frontend worker-video worker-asset-sync worker-atelier-image
compose ps

if ! wait_for_http "frontend" "http://127.0.0.1:${FRONTEND_PORT}/health"; then
  print_failure_logs
  log_phase "DEPLOY_FAILED" "reason=frontend_healthcheck env=${ENV_NAME}"
  if rollback_to_previous_release; then
    log_phase "DEPLOY_ROLLED_BACK" "env=${ENV_NAME} reason=frontend_healthcheck"
  fi
  exit 1
fi

if ! wait_for_http "backend" "http://127.0.0.1:${BACKEND_PORT}/health"; then
  print_failure_logs
  log_phase "DEPLOY_FAILED" "reason=backend_healthcheck env=${ENV_NAME}"
  if rollback_to_previous_release; then
    log_phase "DEPLOY_ROLLED_BACK" "env=${ENV_NAME} reason=backend_healthcheck"
  fi
  exit 1
fi

mkdir -p "$CURRENT_ROOT"
ln -sfn "$RELEASE_ROOT" "${CURRENT_ROOT}/${ENV_NAME}"
log_phase "DEPLOY_SUCCEEDED" "env=${ENV_NAME} release_root=${RELEASE_ROOT} image_tag=${IMAGE_TAG}"
