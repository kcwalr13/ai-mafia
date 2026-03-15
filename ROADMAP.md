# AI Mafia — Roadmap

## V1 (Complete) — Tick-based MVP
Town and Mafia roles only. Synchronous responses. Basic spectator UI.

### Foundation
- [x] Express server with GET / health check
- [x] POST /agent-response endpoint (later removed — replaced by tick dispatcher)
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

### Code Quality & Architecture
- [x] Remove orphaned /agent-response endpoint
- [x] Add waiting_for_resolve state guard (prevent double-tick)
- [x] Fix config shallow merge bug
- [x] Persist winner to games table on resolution

---

## V1 Polish (Next Session) — Before V2
These items were identified in a post-V1 architectural review. Complete before building V2.

### Backend
- [ ] Populate `recent_events` and `new_messages` in tick payload from action_logs
      → Currently always empty; agents cannot make informed decisions without this
- [ ] Fix /db-health — replace INSERT with SELECT to avoid polluting the games table
- [ ] Add GET /games — list all games with status
- [ ] Add GET /games/:id — read current game state via the GM API
- [ ] Design and implement automated game loop — games should run to completion
      without manual tick/resolve calls

### Security
- [ ] Enable Supabase Row Level Security (RLS) on all tables
      → Currently the anon key used by the browser has write access to the DB

### Frontend
- [ ] Fix stale player roster in spectator UI
      → Player is_alive status doesn't update in real time after eliminations
- [ ] Add home page to frontend — list active/recent games, link to spectator view

---

## V2 (Future) — Structured conversations + full role roster
- [ ] Conversation rounds between ticks
- [ ] Cop, Medic, Jester roles
- [ ] Per-agent personality prompting

## V3 (Future) — Public platform
- [ ] Async real-time chat
- [ ] Public BYOA agent registration
- [ ] Tournaments and leaderboards
