#!/usr/bin/env bash
# Manual smoke test of the parent flow against a running API: register, create a family and a
# child, issue an invite. Prints the invite code to feed into `npm run simulate:child`.
set -euo pipefail
API="${API:-http://localhost:3000}"
EMAIL="${EMAIL:-parent+$(date +%s)@example.com}"
# A fake push token so the log push driver (PUSH_DRIVER=log) prints the parent's notifications.
PUSH_TOKEN="smoke-parent-$(date +%s)-push-token"
DEVICE="{\"platform\":\"android\",\"model\":\"smoke\",\"pushToken\":\"$PUSH_TOKEN\"}"

req() { curl -sS --fail-with-body -H 'Content-Type: application/json' ${TOKEN:+-H "Authorization: Bearer $TOKEN"} "$@"; }

TOKEN=$(req -X POST "$API/v1/auth/register" -d "{\"email\":\"$EMAIL\",\"password\":\"Smoke-test-pass1\",\"displayName\":\"Олена\",\"acceptPrivacyPolicy\":true,\"device\":$DEVICE}" | jq -r .accessToken)
FAMILY=$(req -X POST "$API/v1/families" -d '{"name":"Родина Коваленків"}' | jq -r .id)
CHILD=$(req -X POST "$API/v1/families/$FAMILY/children" -d '{"displayName":"Марко","birthYear":2013}' | jq -r .id)
CODE=$(req -X POST "$API/v1/families/$FAMILY/children/$CHILD/invites" | jq -r .code)
req -X POST "$API/v1/families/$FAMILY/geofences" -d '{"name":"Дім","kind":"home","lat":50.4501,"lng":30.5162,"radiusM":150}' >/dev/null

echo "email:      $EMAIL"
echo "family:     $FAMILY"
echo "child:      $CHILD"
echo "invite:     $CODE"
echo "token:      $TOKEN"
echo
echo "Next: npm run simulate:child -- --api $API --code $CODE --sos-after 3"
echo "Then: curl -s -H \"Authorization: Bearer \$TOKEN\" $API/v1/families/$FAMILY/locations/latest | jq"
