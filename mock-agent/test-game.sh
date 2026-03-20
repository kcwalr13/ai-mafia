#!/bin/bash
# Run this from the mock-agent directory: bash test-game.sh

BASE="http://localhost:3000"
WEBHOOK="http://localhost:4000/webhook"

echo "=== Step 1: Create game ==="
RESPONSE=$(curl -s -X POST "$BASE/games" \
  -H "Content-Type: application/json" \
  -d "{\"players\":[
    {\"agent_name\":\"Alice\",\"webhook_url\":\"$WEBHOOK\"},
    {\"agent_name\":\"Bob\",\"webhook_url\":\"$WEBHOOK\"},
    {\"agent_name\":\"Carol\",\"webhook_url\":\"$WEBHOOK\"},
    {\"agent_name\":\"Dave\",\"webhook_url\":\"$WEBHOOK\"},
    {\"agent_name\":\"Eve\",\"webhook_url\":\"$WEBHOOK\"},
    {\"agent_name\":\"Frank\",\"webhook_url\":\"$WEBHOOK\"},
    {\"agent_name\":\"Grace\",\"webhook_url\":\"$WEBHOOK\"},
    {\"agent_name\":\"Hank\",\"webhook_url\":\"$WEBHOOK\"}
  ],\"config\":{\"roles\":{\"town\":6,\"mafia\":2}}}")
echo "$RESPONSE"

GAME_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo ""
echo "Game ID: $GAME_ID"

echo ""
echo "=== Step 2: Start game ==="
curl -s -X POST "$BASE/games/$GAME_ID/start"

echo ""
echo ""
echo "=== Step 3: Run game loop ==="
curl -s -X POST "$BASE/games/$GAME_ID/run"

echo ""
echo ""
echo "=== Done. Watch http://localhost:3001/games/$GAME_ID ==="
