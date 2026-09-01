#!/bin/bash
# Register demo org on production + approve via platform + seed shooting data.
set -uo pipefail
B=https://hamd-erp.vercel.app
J=/home/z/my-project/assets-video/shots/cookies
mkdir -p "$J"

echo "=== 1) register demo org ==="
curl -s -X POST "$B/api/auth/register" -H 'Content-Type: application/json' -d '{
  "orgName": "بقالة الوفاء",
  "name": "محمد علي",
  "email": "video.demo3@hamd.app",
  "phone": "01122334455",
  "password": "Demo@Video2026"
}' ; echo

echo "=== 2) login SUPERADMIN ==="
curl -s -c "$J/admin.txt" -X POST "$B/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"owner@hamd.app","password":"Fi27juYmZKOqgmGa"}' | head -c 200 ; echo

echo "=== 3) find pending org ==="
OID=$(curl -s -b "$J/admin.txt" "$B/api/platform/orgs" | python3 -c "
import json,sys
d=json.load(sys.stdin)
orgs=d.get('data',{}).get('orgs',[])
for o in orgs:
    if o.get('ownerEmail')=='video.demo3@hamd.app' and o.get('status')=='PENDING':
        print(o['id']); break
")
echo "pending org id: $OID"
[ -z "$OID" ] && { echo 'NO PENDING ORG — abort'; exit 1; }

echo "=== 4) approve -> TRIAL ==="
curl -s -b "$J/admin.txt" -X POST "$B/api/platform/orgs/$OID" \
  -H 'Content-Type: application/json' -d '{"action":"trial"}' | head -c 300 ; echo

echo "=== 5) login demo org ==="
curl -s -c "$J/demo.txt" -X POST "$B/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"video.demo3@hamd.app","password":"Demo@Video2026"}' | head -c 200 ; echo

echo "=== 6) baseline: units + warehouses ==="
curl -s -b "$J/demo.txt" "$B/api/units" | python3 -m json.tool | head -30
curl -s -b "$J/demo.txt" "$B/api/warehouses" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ws=d.get('warehouses',d if isinstance(d,list) else [])
for w in ws: print(w['id'], w['name'])"
