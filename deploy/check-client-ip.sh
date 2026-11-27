#!/bin/sh
# Proves that the API sees the client's address, not caddy's and not one the client made up.
# Runs the real caddy + nginx.conf + networks of docker-compose.yml with an echo server in
# place of the API (deploy/client-ip-check.yml). Needs Docker; pulls caddy, nginx and python
# images on the first run. Run it on a development machine: on the VM, the running stack
# already owns the edge subnet.
#
#   sh deploy/check-client-ip.sh
set -eu

cd "$(dirname "$0")"
project=leetkob-ipcheck
compose() {
  # Dummy values: the check starts no database and no real service.
  LEETKOB_DOMAIN=':80' DB_USER=check DB_PASSWORD=check JWT_SECRET=check DOCKER_GID=0 \
    docker compose -p "$project" -f docker-compose.yml -f client-ip-check.yml "$@"
}
cleanup() { compose --profile ipcheck down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

compose up -d --quiet-pull api web caddy >/dev/null 2>&1
caddy_ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' \
  "$(compose ps -q caddy)")

attempt() {
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if out=$(compose --profile ipcheck run --rm --quiet-pull "$1" "$2" 2>/dev/null); then
      printf '%s\n' "$out" | tail -n 1
      return 0
    fi
    sleep 1
  done
  echo "FAIL: $1 could not reach $2" >&2
  return 1
}

field() { printf '%s' "$1" | python3 -c "import json,sys; print(json.load(sys.stdin)['$2'] or '')"; }

status=0
check() { # name, json
  client=$(field "$2" client)
  seen=$(field "$2" xff)
  spoof=$(field "$2" spoof)
  echo "$1: client=$client api-saw=$seen (sent X-Forwarded-For: $spoof; caddy=$caddy_ip)"
  if [ "$seen" != "$client" ]; then
    echo "FAIL: $1: the API saw $seen instead of the client address $client" >&2
    status=1
  fi
}

outside=$(attempt outside-client http://caddy/api/whoami)
check "through caddy" "$outside"
inside=$(attempt inside-client http://web/api/whoami)
check "direct to web " "$inside"

if [ "$status" -eq 0 ]; then
  echo "PASS: the API sees the client address; caddy's address and spoofed headers are ignored"
fi
exit "$status"
