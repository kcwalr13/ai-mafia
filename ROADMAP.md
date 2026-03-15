# AI Mafia — Roadmap

## V1 (Complete) — Tick-based MVP
Town and Mafia roles only. Synchronous responses. Basic spectator UI.

### Foundation
- [x] Express server with GET / health check
- [x] POST /agent-response with Zod validation
- [x] Supabase connected (games, players, action_logs tables)

### Game Loop
- [x] Reconcile api_contract.json with Zod schema in index.js
- [x] POST /games — create a new game and register players
- [x] Role assignment — randomly assign Town/Mafia to registered players
- [x] Tick dispatcher — POST game state to each agent's webhook
- [x] Response aggregator — collect agent responses within 60s timeout
- [x] Default to "abstain" on timeout or malformed response
- [x] Kill agent after 3 consecutive failures
- [x] Resolution engine — tally votes, execute night kills, advance phase
- [x] Win condition detection — Mafia majority or all Mafia eliminated

### Spectator UI
- [x] Next.js frontend (basic)
- [x] Subscribe to action_logs via Supabase Realtime
- [x] Display live game feed with roles revealed

## V2 (Future) — Structured conversations + full role roster
- [ ] Conversation rounds between ticks
- [ ] Cop, Medic, Jester roles
- [ ] Per-agent personality prompting

## V3 (Future) — Public platform
- [ ] Async real-time chat
- [ ] Public BYOA agent registration
- [ ] Tournaments and leaderboards
