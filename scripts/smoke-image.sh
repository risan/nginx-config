#!/usr/bin/env sh
set -eu

image=${1:-nginx-config:ci}
expected_nginx_version=${NGINX_VERSION:-1.30.5}
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
config_path=${NGINX_CONFIG_PATH:-"$repo_root/docker/nginx.conf"}
case "$config_path" in
  /*) ;;
  *) config_path="$repo_root/$config_path" ;;
esac
[ -f "$config_path" ] || { echo "missing generated Docker config: $config_path" >&2; exit 1; }

tmpdir=$(mktemp -d "${TMPDIR:-/tmp}/nginx-config-smoke.XXXXXX")
name="nginx-config-smoke-$(basename "$tmpdir")"
custom_name="${name}-custom"
custom_root="$tmpdir/site"
mkdir -p "$custom_root"

cleanup() {
  docker rm -f "$name" "$custom_name" >/dev/null 2>&1 || true
  rm -rf "$tmpdir"
}
trap cleanup EXIT INT TERM

run_container() {
  if [ -n "${DOCKER_PLATFORM:-}" ]; then
    docker run -d --platform "$DOCKER_PLATFORM" "$@"
  else
    docker run -d "$@"
  fi
}

discover_port() {
  container=$1
  container_port=$2
  port=''
  for _ in $(seq 1 60); do
    port=$(docker port "$container" "$container_port/tcp" 2>/dev/null | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -n1)
    [ -n "$port" ] && break
    sleep 0.2
  done
  [ -n "$port" ] || { docker logs "$container" >&2; exit 1; }
  printf '%s' "$port"
}

wait_for_status() {
  port=$1
  path=$2
  expected=$3
  output=$4
  status=000
  for _ in $(seq 1 60); do
    status=$(curl --silent --show-error --output "$output" --write-out '%{http_code}' \
      --header 'Host: localhost' "http://127.0.0.1:$port$path" || true)
    [ "$status" = "$expected" ] && break
    sleep 0.2
  done
  [ "$status" = "$expected" ] || {
    echo "${path} returned ${status}, expected ${expected}" >&2
    exit 1
  }
}

# The image default is a static site. This checks the packaged welcome page,
# health endpoint, and that an application route is not silently SPA-fallbacked.
container_id=$(run_container \
  --name "$name" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,uid=101,gid=101,mode=1777 \
  --cap-drop=ALL \
  --security-opt no-new-privileges:true \
  -p 127.0.0.1::8080 \
  "$image")
port=$(discover_port "$name" 8080)
wait_for_status "$port" / 200 "$tmpdir/default-index.html"
grep -Fq 'NGINX runtime is ready' "$tmpdir/default-index.html" || {
  echo 'default image did not serve the packaged NGINX welcome page' >&2
  exit 1
}
wait_for_status "$port" /healthz 204 "$tmpdir/default-health"
default_route_status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --header 'Host: localhost' "http://127.0.0.1:$port/settings")
[ "$default_route_status" = 404 ] || {
  echo "default application route returned $default_route_status instead of 404" >&2
  exit 1
}
missing_status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --header 'Host: localhost' "http://127.0.0.1:$port/missing-file.txt")
[ "$missing_status" = 404 ] || {
  echo "missing static file returned $missing_status instead of 404" >&2
  exit 1
}
unknown_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header 'Host: unknown.example' "http://127.0.0.1:$port/" || true)
case "$unknown_status" in
  000|444) ;;
  *) echo "unknown Host returned $unknown_status instead of a rejected request" >&2; exit 1 ;;
esac

runtime_user=$(docker inspect --format '{{.Config.User}}' "$container_id")
case "$runtime_user" in
  ''|0|0:0|root|root:root) echo "container is root: $runtime_user" >&2; exit 1 ;;
esac
readonly_root=$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$container_id")
[ "$readonly_root" = true ] || { echo 'default smoke did not use a read-only root'; exit 1; }

nginx_version=$(docker exec "$container_id" nginx -v 2>&1)
case "$nginx_version" in
  *"nginx/$expected_nginx_version"*) ;;
  *) echo "unexpected NGINX version: $nginx_version (expected $expected_nginx_version)" >&2; exit 1 ;;
esac

# Replace both the site content and the complete renderer-generated config.
# This is the supported deployment contract for PHP, Go, and proxy profiles.
cat >"$custom_root/index.html" <<'EOF'
<!doctype html>
<html><body><h1>Mounted static content</h1></body></html>
EOF
printf 'not-public\n' >"$custom_root/.env"
i=0
while [ "$i" -lt 4096 ]; do
  printf 'compressible static fixture\n'
  i=$((i + 1))
done >"$custom_root/large.txt"

custom_id=$(run_container \
  --name "$custom_name" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,uid=101,gid=101,mode=1777 \
  --cap-drop=ALL \
  --security-opt no-new-privileges:true \
  -p 127.0.0.1::8080 \
  --mount "type=bind,src=$config_path,dst=/etc/nginx/nginx.conf,readonly" \
  --mount "type=bind,src=$custom_root,dst=/usr/share/nginx/html,readonly" \
  "$image")
custom_port=$(discover_port "$custom_name" 8080)
wait_for_status "$custom_port" / 200 "$tmpdir/custom-index.html"
grep -Fq 'Mounted static content' "$tmpdir/custom-index.html" || {
  echo 'custom read-only content mount was not served' >&2
  exit 1
}
wait_for_status "$custom_port" /healthz 204 "$tmpdir/custom-health"
custom_route_status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --header 'Host: localhost' "http://127.0.0.1:$custom_port/settings")
[ "$custom_route_status" = 404 ] || {
  echo "custom static route returned $custom_route_status instead of 404" >&2
  exit 1
}
secret_status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --header 'Host: localhost' "http://127.0.0.1:$custom_port/.env")
case "$secret_status" in
  403|404) ;;
  *) echo "sensitive path returned $secret_status" >&2; exit 1 ;;
esac

host_config_sha=$(sha256sum "$config_path" | awk '{print $1}')
container_config_sha=$(docker exec "$custom_id" sha256sum /etc/nginx/nginx.conf | awk '{print $1}')
[ "$host_config_sha" = "$container_config_sha" ] || {
  echo 'complete generated config was not mounted at /etc/nginx/nginx.conf' >&2
  exit 1
}

curl --silent --show-error --dump-header "$tmpdir/gzip.headers" --output "$tmpdir/gzip.body" \
  --header 'Host: localhost' --header 'Accept-Encoding: gzip' "http://127.0.0.1:$custom_port/large.txt"
grep -Eiq '^Content-Encoding:[[:space:]]*gzip' "$tmpdir/gzip.headers" || {
  echo 'large mounted text asset was not gzip-compressed' >&2
  exit 1
}
curl --silent --show-error --output "$tmpdir/plain.body" \
  --header 'Host: localhost' --header 'Accept-Encoding: identity' "http://127.0.0.1:$custom_port/large.txt"
compressed_bytes=$(wc -c <"$tmpdir/gzip.body")
plain_bytes=$(wc -c <"$tmpdir/plain.body")
[ "$compressed_bytes" -lt "$plain_bytes" ] || {
  echo "gzip did not reduce wire bytes ($compressed_bytes >= $plain_bytes)" >&2
  exit 1
}

printf 'PASS image=%s nginx=%s port=%s user=%s static=default+mounted gzip=%s/%s health=204\n' \
  "$image" "$expected_nginx_version" "$port" "$runtime_user" "$compressed_bytes" "$plain_bytes"
