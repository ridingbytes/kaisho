#!/usr/bin/env bash
# Populate the demo-screenshots profile with sample data
set -e
BASE="http://localhost:8765/api"
POST="curl -s -X POST -H Content-Type:application/json"
PATCH="curl -s -X PATCH -H Content-Type:application/json"

echo "=== Creating customers ==="
$POST "$BASE/customers/" -d '{
  "name":"Acme Biotech","status":"active",
  "type":"CLIENT","color":"#3b82f6","budget":120,
  "tags":["biotech","premium"]}'
$POST "$BASE/customers/" -d '{
  "name":"NovaChem Labs","status":"active",
  "type":"CLIENT","color":"#8b5cf6","budget":80,
  "tags":["chemistry"]}'
$POST "$BASE/customers/" -d '{
  "name":"EuroLab AG","status":"active",
  "type":"PROSPECT","color":"#06b6d4","budget":0,
  "tags":["pharma"]}'
$POST "$BASE/customers/" -d '{
  "name":"GreenField Research","status":"active",
  "type":"LEAD","color":"#22c55e","budget":0}'
$POST "$BASE/customers/" -d '{
  "name":"Internal","status":"active",
  "type":"INTERN","color":"#6e7781","budget":0}'

echo ""
echo "=== Creating contracts ==="
$POST "$BASE/customers/Acme%20Biotech/contracts" -d '{
  "name":"LIMS Phase 2","budget":120,
  "start_date":"2026-01-15","billable":true}'
$POST "$BASE/customers/NovaChem%20Labs/contracts" -d '{
  "name":"Support Q2/2026","budget":80,
  "start_date":"2026-04-01","billable":true}'

echo ""
echo "=== Creating tasks ==="
$POST "$BASE/kanban/tasks" -d '{
  "customer":"Acme Biotech",
  "title":"Implement sample tracking module",
  "status":"IN-PROGRESS"}'
$POST "$BASE/kanban/tasks" -d '{
  "customer":"Acme Biotech",
  "title":"Fix PDF report generation",
  "status":"NEXT"}'
$POST "$BASE/kanban/tasks" -d '{
  "customer":"NovaChem Labs",
  "title":"Database migration to PostgreSQL",
  "status":"IN-PROGRESS"}'
$POST "$BASE/kanban/tasks" -d '{
  "customer":"NovaChem Labs",
  "title":"User training documentation",
  "status":"TODO"}'
$POST "$BASE/kanban/tasks" -d '{
  "customer":"EuroLab AG",
  "title":"Initial requirements workshop",
  "status":"NEXT"}'
$POST "$BASE/kanban/tasks" -d '{
  "customer":"Internal",
  "title":"Update deployment scripts",
  "status":"TODO"}'
$POST "$BASE/kanban/tasks" -d '{
  "customer":"Acme Biotech",
  "title":"Setup CI/CD pipeline",
  "status":"DONE"}'
$POST "$BASE/kanban/tasks" -d '{
  "customer":"NovaChem Labs",
  "title":"API endpoint review",
  "status":"DONE"}'

echo ""
echo "=== Creating clock entries ==="
# Stagger start times per customer so two entries on the
# same day never collide on start timestamp. Identifying
# entries by start_iso alone is brittle, so the API
# prefers sync_id, but unique starts also keep the seed
# data legible in the UI.
for i in $(seq 1 8); do
  DAY=$(python3 -c "from datetime import date,timedelta; print((date.today()-timedelta(days=$i)).isoformat())")
  HOURS=$((2 + RANDOM % 5))
  CUST="Acme Biotech"
  CONTRACT="LIMS Phase 2"
  DESC="Sample tracking development"
  START_TIME="${DAY}T09:00:00"
  if [ $((i % 3)) -eq 0 ]; then
    CUST="NovaChem Labs"
    CONTRACT="Support Q2/2026"
    DESC="Database migration work"
    START_TIME="${DAY}T13:00:00"
  fi
  if [ $((i % 5)) -eq 0 ]; then
    CUST="Internal"
    CONTRACT=""
    DESC="Infrastructure maintenance"
    START_TIME="${DAY}T16:00:00"
  fi
  if [ -n "$CONTRACT" ]; then
    $POST "$BASE/clocks/quick-book" -d "{
      \"duration\":\"${HOURS}h\",\"customer\":\"$CUST\",
      \"description\":\"$DESC\",
      \"contract\":\"$CONTRACT\",\"date\":\"$DAY\",
      \"start_time\":\"$START_TIME\"}"
  else
    $POST "$BASE/clocks/quick-book" -d "{
      \"duration\":\"${HOURS}h\",\"customer\":\"$CUST\",
      \"description\":\"$DESC\",\"date\":\"$DAY\",
      \"start_time\":\"$START_TIME\"}"
  fi
done

echo ""
echo "=== Creating inbox items ==="
$POST "$BASE/inbox/" -d '{
  "text":"Follow up on EuroLab AG proposal",
  "type":"EMAIL","customer":"EuroLab AG",
  "channel":"email","direction":"out"}'
$POST "$BASE/inbox/" -d '{
  "text":"GreenField Research interested in LIMS demo",
  "type":"LEAD","customer":"GreenField Research",
  "channel":"email","direction":"in"}'
$POST "$BASE/inbox/" -d '{
  "text":"Review NovaChem security audit results",
  "type":"NOTE","customer":"NovaChem Labs"}'
$POST "$BASE/inbox/" -d '{
  "text":"Schedule team sync for next sprint",
  "type":"NOTE","channel":"meeting"}'
$POST "$BASE/inbox/" -d '{
  "text":"Update pricing page on website",
  "type":"IDEA"}'

echo ""
echo "=== Creating notes ==="
$POST "$BASE/notes/" -d '{
  "title":"Sprint Planning Q2",
  "body":"Focus areas:\n- Acme sample tracking module\n- NovaChem migration\n- EuroLab requirements\n\nTimeline: 6 weeks",
  "customer":"Internal","tags":["@meeting"]}'
$POST "$BASE/notes/" -d '{
  "title":"NovaChem Migration Notes",
  "body":"PostgreSQL 16 target. Need to handle:\n- Legacy data conversion\n- Index optimization\n- Connection pooling setup",
  "customer":"NovaChem Labs","tags":["@code"]}'
$POST "$BASE/notes/" -d '{
  "title":"LIMS Architecture Decision",
  "body":"Decided to use event-driven architecture for sample tracking. Benefits:\n- Better audit trail\n- Easier to extend\n- Real-time updates via WebSocket",
  "customer":"Acme Biotech","tags":["@code"]}'

echo ""
echo "=== Configuring tags ==="
$POST "$BASE/settings/tags" -d '{"name":"@email","color":"#3b82f6","description":"Email related"}'
$POST "$BASE/settings/tags" -d '{"name":"@meeting","color":"#8b5cf6","description":"Meeting notes"}'
$POST "$BASE/settings/tags" -d '{"name":"@code","color":"#06b6d4","description":"Code related"}'
$POST "$BASE/settings/tags" -d '{"name":"@github","color":"#6e7781","description":"GitHub related"}'
$POST "$BASE/settings/tags" -d '{"name":"@prio-high","color":"#dc2626","description":"High priority"}'

echo ""
echo "=== Setting app title ==="
echo "Done creating demo data!"
