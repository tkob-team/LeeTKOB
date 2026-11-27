#!/bin/sh
# Proves that nginx answers 404 for paths that start with a dot (/.env, /.git/config) instead of
# serving index.html, while client-side routes (/login) still get index.html. Runs the real
# deploy/nginx.conf in the nginx image of docker-compose.yml with a stub page. Needs Docker;
# pulls nginx on the first run.
#
#   sh deploy/check-dotfiles.sh
set -eu

cd "$(dirname "$0")"
name="leetkob-dotcheck-$$"
html=$(mktemp -d)
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  rm -r "$html"
}
trap cleanup EXIT

printf '<!doctype html><title>stub</title>\n' >"$html/index.html"
# nginx resolves the /api/ upstream at start-up, so "api" must exist.
docker run -d --quiet --name "$name" --add-host api:127.0.0.1 \
  -v "$PWD/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$html:/usr/share/nginx/html:ro" nginx:1.29-alpine >/dev/null

status_of() { # path -> HTTP status code seen inside the container
  docker exec "$name" sh -c \
    "wget -S -q -O /dev/null 'http://127.0.0.1$1' 2>&1 | awk '/HTTP\//{print \$2; exit}'"
}

for _ in 1 2 3 4 5 6 7 8 9 10; do
  [ "$(status_of /login)" = 200 ] && break
  sleep 1
done

status=0
check() { # path, expected status
  got=$(status_of "$1")
  echo "$1 -> $got (expected $2)"
  if [ "$got" != "$2" ]; then
    echo "FAIL: $1 answered $got instead of $2" >&2
    status=1
  fi
}

check /login 200
check /ta/labs 200
check /.env 404
check /.git/config 404
check /assets/.env 404

if [ "$status" -eq 0 ]; then
  echo "PASS: dot paths get 404; client-side routes still get index.html"
fi
exit "$status"
