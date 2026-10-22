#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
petra_image_tag="${PETRA_IMAGE_TAG:-local-verify}"
if [[ ! "$petra_image_tag" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]]; then
  echo 'Invalid image tag' >&2
  exit 1
fi
petra_build_options=()
if [[ -n "${CODEX_PROXY_CERT:-}" ]]; then
  test -r "$CODEX_PROXY_CERT"
  petra_build_options+=(--secret "id=proxy_ca,src=$CODEX_PROXY_CERT")
fi
for petra_target in api worker web; do
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS \
    -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock build "${petra_build_options[@]}" --target "$petra_target" \
    --tag "petra-${petra_target}:${petra_image_tag}" \
    -f infra/production/Dockerfile .
done
