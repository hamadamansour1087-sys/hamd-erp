#!/bin/bash
# Clean demo org children via tenant APIs, then delete org via platform API.
set -u
B=https://hamd-erp.vercel.app
J=/home/z/my-project/assets-video/shots/cookies
C="$J/demo2.txt"

# fresh login
curl -s -c "$C" -X POST "$B/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"video.demo3@hamd.app","password":"Demo@Video2026"}' | head -c 60; echo

del_all() { # <endpoint> — GET list, DELETE each id
  local EP=$1 IDS
  IDS=$(curl -s -b "$C" "$B/api/$EP" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)['data']
    rows = d['rows'] if isinstance(d,dict) and 'rows' in d else (d if isinstance(d,list) else d.get('invoices',[]))
    print('\n'.join(r['id'] for r in rows))
except Exception as e: print('', end='')")
  for id in $IDS; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$C" -X DELETE "$B/api/$EP/$id")
    echo "$EP/$id -> $CODE"
  done
}

echo "== invoices ==";  del_all invoices
echo "== vouchers ==";  del_all "vouchers"
echo "== products ==";  del_all products
echo "== customers =="; del_all customers
echo "== suppliers =="; del_all suppliers
echo "== categories =="; del_all categories
echo "== units ==";     del_all units
echo "== warehouses =="; del_all warehouses

echo "== org delete =="
curl -s -w "\nHTTP=%{http_code}\n" -b "$J/admin.txt" -X POST \
  "$B/api/platform/orgs/cmti4jv8u0001ib04vn47k58h" -H 'Content-Type: application/json' -d '{"action":"delete"}'

echo "== remaining =="
curl -s -b "$J/admin.txt" "$B/api/platform/orgs" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
print('stats:', d['stats'])
for o in d['orgs']: print('-', o['name'], o['status'])"
