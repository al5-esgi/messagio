#!/usr/bin/env bash
set -euo pipefail

# Chaos reseau devant la pile temps reel (etape 9).
#
# toxiproxy s'intercale entre le navigateur et le proxy nginx :
#   navigateur -> :19001 (toxiproxy) -> proxy:3000 (nginx) -> app-a / app-b
#
# Prerequis : `docker compose up --build -d`, puis pointer les clients sur
# http://localhost:19001 (et NON :3000, qui contourne le chaos).
#
# Usage :
#   bash chaos.sh            # 200 ms de latence, puis coupure de 5 s
#   bash chaos.sh latence    # ajoute seulement la latence
#   bash chaos.sh coupure 8  # coupe seulement, 8 secondes
#   bash chaos.sh reset      # retire tout

API=${API:-http://localhost:8474}
UPSTREAM=${UPSTREAM:-proxy:3000}
NOM=realtime

creer() {
  curl -sf -XPOST "${API}/proxies" \
    -d "{\"name\":\"${NOM}\",\"listen\":\"0.0.0.0:19001\",\"upstream\":\"${UPSTREAM}\"}" >/dev/null \
    && echo "proxy '${NOM}' cree -> ${UPSTREAM}" \
    || echo "proxy '${NOM}' deja present"
}

latence() {
  curl -sf -XPOST "${API}/proxies/${NOM}/toxics" \
    -d '{"name":"lat","type":"latency","attributes":{"latency":200,"jitter":0}}' >/dev/null \
    && echo "+200 ms de latence" || echo "latence deja injectee"
}

coupure() {
  local d=${1:-5}
  echo "coupure de ${d} s..."
  curl -sf -XPOST "${API}/proxies/${NOM}" -d '{"enabled":false}' >/dev/null
  sleep "${d}"
  curl -sf -XPOST "${API}/proxies/${NOM}" -d '{"enabled":true}' >/dev/null
  echo "reseau retabli a $(date +%H:%M:%S) - observez la reconnexion et le resync"
}

reset() {
  curl -sf -XDELETE "${API}/proxies/${NOM}/toxics/lat" >/dev/null 2>&1 || true
  curl -sf -XPOST "${API}/proxies/${NOM}" -d '{"enabled":true}' >/dev/null
  echo "toxines retirees, proxy actif"
}

creer
case "${1:-tout}" in
  latence) latence ;;
  coupure) coupure "${2:-5}" ;;
  reset)   reset ;;
  *)       latence; coupure "${2:-5}" ;;
esac
