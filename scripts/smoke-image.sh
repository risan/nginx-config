#!/usr/bin/env sh
set -eu

image=${1:-nginx-config-generator:ci}
expected_nginx_version=${NGINX_VERSION:-1.30.5}
tmpdir=$(mktemp -d "${TMPDIR:-/tmp}/nginx-config-smoke.XXXXXX")
name="nginx-config-smoke-$(basename "$tmpdir")"

cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  rm -rf "$tmpdir"
}
trap cleanup EXIT INT TERM

if [ -n "${DOCKER_PLATFORM:-}" ]; then
  container_id=$(docker run -d --platform "$DOCKER_PLATFORM" \
    --name "$name" \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,uid=101,gid=101,mode=1777 \
    --cap-drop=ALL \
    --security-opt no-new-privileges:true \
    -p 127.0.0.1::8080 \
    "$image")
else
  container_id=$(docker run -d \
    --name "$name" \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,uid=101,gid=101,mode=1777 \
    --cap-drop=ALL \
    --security-opt no-new-privileges:true \
    -p 127.0.0.1::8080 \
    "$image")
fi

port=''
for _ in $(seq 1 60); do
  port=$(docker port "$container_id" 8080/tcp 2>/dev/null | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -n1)
  [ -n "$port" ] && break
  sleep 0.2
done
[ -n "$port" ] || { docker logs "$container_id"; exit 1; }

request() {
  curl --fail-with-body --silent --show-error --header 'Host: localhost' "$@"
}

for _ in $(seq 1 60); do
  status=$(request -o "$tmpdir/index.html" -w '%{http_code}' "http://127.0.0.1:$port/") || status=000
  if [ "$status" = 200 ]; then
    break
  fi
  sleep 0.2
done
[ -s "$tmpdir/index.html" ] || { docker logs "$container_id"; exit 1; }

health_status=$(curl --silent --show-error --output "$tmpdir/health" --write-out '%{http_code}' \
  --header 'Host: localhost' "http://127.0.0.1:$port/healthz")
[ "$health_status" = 204 ] || {
  echo "expected /healthz to return 204, got $health_status" >&2
  exit 1
}

route_status=$(request --output "$tmpdir/route.html" --write-out '%{http_code}' "http://127.0.0.1:$port/settings")
[ "$route_status" = 200 ] || { echo "SPA route returned $route_status" >&2; exit 1; }
cmp -s "$tmpdir/index.html" "$tmpdir/route.html" || {
  echo 'SPA route did not return the entry document' >&2
  exit 1
}

asset_path=$(docker exec "$container_id" sh -c "find /usr/share/nginx/html/assets -type f \( -name '*.js' -o -name '*.css' \) | head -n 1" | sed 's#^/usr/share/nginx/html##')
[ -n "$asset_path" ] || { echo 'no built asset found for compression check' >&2; exit 1; }

asset_status=$(request --output "$tmpdir/asset" --write-out '%{http_code}' "http://127.0.0.1:$port$asset_path")
[ "$asset_status" = 200 ] || { echo "asset returned $asset_status" >&2; exit 1; }
missing_asset_status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --header 'Host: localhost' "http://127.0.0.1:$port/assets/missing-file.js")
[ "$missing_asset_status" = 404 ] || {
  echo "missing asset returned $missing_asset_status" >&2
  exit 1
}

secret_status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --header 'Host: localhost' "http://127.0.0.1:$port/.env")
case "$secret_status" in
  403|404) ;;
  *) echo "sensitive path returned $secret_status" >&2; exit 1 ;;
esac

curl --silent --show-error --dump-header "$tmpdir/gzip.headers" --output "$tmpdir/gzip.body" \
  --header 'Host: localhost' --header 'Accept-Encoding: gzip' "http://127.0.0.1:$port$asset_path"
grep -Eiq '^Content-Encoding:[[:space:]]*gzip' "$tmpdir/gzip.headers" || {
  echo 'large text asset was not gzip-compressed' >&2
  exit 1
}
curl --silent --show-error --output "$tmpdir/plain.body" \
  --header 'Host: localhost' --header 'Accept-Encoding: identity' "http://127.0.0.1:$port$asset_path"
compressed_bytes=$(wc -c <"$tmpdir/gzip.body")
plain_bytes=$(wc -c <"$tmpdir/plain.body")
[ "$compressed_bytes" -lt "$plain_bytes" ] || {
  echo "gzip did not reduce wire bytes ($compressed_bytes >= $plain_bytes)" >&2
  exit 1
}

runtime_user=$(docker inspect --format '{{.Config.User}}' "$container_id")
case "$runtime_user" in
  ''|0|0:0|root|root:root) echo "container is root: $runtime_user" >&2; exit 1 ;;
esac

nginx_version=$(docker exec "$container_id" nginx -v 2>&1)
case "$nginx_version" in
  *"nginx/$expected_nginx_version"*) ;;
  *) echo "unexpected NGINX version: $nginx_version (expected $expected_nginx_version)" >&2; exit 1 ;;
esac

health_state='starting'
for _ in $(seq 1 60); do
  health_state=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container_id")
  [ "$health_state" = healthy ] && break
  sleep 0.2
done
[ "$health_state" = healthy ] || { docker inspect "$container_id"; exit 1; }

printf 'PASS image=%s nginx=%s port=%s user=%s gzip=%s/%s bytes health=%s\n' \
  "$image" "$expected_nginx_version" "$port" "$runtime_user" "$compressed_bytes" "$plain_bytes" "$health_state"
