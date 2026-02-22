#!/usr/bin/env bash
# Simple test script for CirculoAI endpoints (local server at http://localhost:3000)
# Usage: bash dev/ai-tests.sh

BASE_URL="http://localhost:3000"
API_KEY="test-internal-key"

set -euo pipefail

echo "1) Classify (text-only)"
curl -sS -X POST "$BASE_URL/ai/classify" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"description":"Small clear PET bottles and palm oil sachets mixed together in a sack"}' 

echo "\n2) Classify (multipart) — create a tiny sample PNG and upload it"
TMP_IMG=$(mktemp --suffix=.png)
cat > "$TMP_IMG" <<'BASE64'
iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=
BASE64
base64 -d "$TMP_IMG" > "$TMP_IMG.dec" || true
# The above tmp has base64 text; decode to produce an actual PNG when possible
if [ -s "$TMP_IMG.dec" ]; then
  mv "$TMP_IMG.dec" "$TMP_IMG"
fi

curl -sS -X POST "$BASE_URL/ai/classify" \
  -H "x-api-key: $API_KEY" \
  -F "image=@$TMP_IMG" \
  -F "description=Outdoor market waste, mostly plastic sachets"

rm -f "$TMP_IMG"

echo "\n3) Price forecast"
curl -sS -X POST "$BASE_URL/ai/price" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"waste_type":"plastic","zone_id":"11111111-1111-1111-1111-111111111111"}'

echo "\n4) Chat (SSE) — use curl -N to stream"

curl -N -X POST "$BASE_URL/ai/chat" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"messages":[{"role":"user","content":"How should I prepare palm oil sachets for collection?"}],"language":"en"}'

echo "\nDone."
