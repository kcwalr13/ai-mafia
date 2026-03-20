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

## V1 Polish (Complete) — Before V2
Identified in a post-V1 architectural review.

### Backend
- [x] Populate `recent_events` and `new_messages` in tick payload from action_logs
- [x] Fix /db-health — replace INSERT with SELECT to avoid polluting the games table
- [x] Add GET /games — list all games with status
- [x] Add GET /games/:id — read current game state via the GM API
- [x] Automated game loop — POST /games/:id/run fires a background tick→resolve loop
      → NOTE: Not crash-safe. See V1.5.

### Security
- [x] Enable Supabase Row Level Security (RLS) on all tables
      → Browser anon key now has SELECT-only access via RLS policies
      → GM server uses SUPABASE_SERVICE_ROLE_KEY in db.js (bypasses RLS)

### Frontend
- [x] Fix stale player roster in spectator UI
      → Now subscribes to UPDATE events on players table via Supabase Realtime
- [x] Add home page to frontend — list active/recent games, link to spectator view
      → Subscribes to INSERT + UPDATE on games table for live status updates
- [x] Polish spectator event feed — human-readable cards per entry type

### Tooling
- [x] Mock agent server (mock-agent/) for local end-to-end testing
- [x] test-game.sh — one-command game creation, start, and run

---

## V1.5 (Next) — Reliability
One item of infrastructure debt to resolve before adding V2 complexity.

- [x] Game loop crash recovery
      → On startup, recoverStalledGames() queries for games in 'in_progress' or
         'waiting_for_resolve' and resumes their loops automatically.
      → 'waiting_for_resolve' games run performResolve() first, then continue.
      → 'in_progress' games resume directly from the next tick.

---

## V2 (Future) — Rich Gameplay
Introduces structured conversation, a full role roster, and per-agent identity.
No platform changes — still local/operator-run games.

### Conversation Rounds
Today agents get one tick per phase and immediately vote. V2 adds a discussion
stage before voting, so agents can reason publicly, accuse, defend, and bluff.

- [ ] Add `discussion_rounds` to game config (default: 2)
- [ ] New phase sub-step: before the action tick, run N discussion ticks
      → Discussion tick: GM sends full game state to all alive agents
      → Agents respond with public_message and optional direct_messages only
         (no action required — action field is absent from discussion response schema)
      → All messages are logged to action_logs with entry_type 'discussion'
      → After all discussion rounds complete, run the action tick (vote/kill) as normal
- [ ] Update api_contract.json with discussion tick request/response schemas
- [ ] Update spectator event feed to render 'discussion' entries distinctly
      → Show speaker name + message in a chat-bubble style, grouped by round

### Full Role Roster
- [ ] Cop role
      → Night action: investigate a target player, learn their exact role
      → Result delivered as a direct_message at the start of the next tick:
         e.g. "Your investigation of Agent_Bob reveals: town."
      → Cop is town-aligned — wins with town
- [ ] Medic role
      → Night action: protect a target player from elimination
      → If mafia targets the same player the Medic protects, the kill is blocked
         and no elimination occurs (a 'block' event is logged but role not revealed)
      → Medic cannot protect themselves two nights in a row
      → Medic is town-aligned — wins with town
- [ ] Jester role
      → Wins if eliminated by a town day vote (not a night kill)
      → Jester's goal is to act suspicious enough to get voted out
      → If Jester is killed at night, they are simply eliminated (no special win)
      → Jester is a neutral role — neither town nor mafia aligned
- [ ] Update DEFAULT_CONFIG and config validation to support cop/medic/jester counts
- [ ] Update win condition logic to handle Jester win
- [ ] Update role assignment to handle expanded role list
- [ ] Update api_contract.json with new roles and night action result schema

### Mafia Ally Visibility (Bug Fix)
Currently mafia agents receive their own role but don't know who else is mafia.
In real Mafia, mafia members know each other — this is a core mechanic.

- [ ] Add `mafia_members` field to tick payload, populated only when agent_role === 'mafia'
      → Value: array of agent_names of all alive mafia players (including self)
      → Town players receive `mafia_members: null`
- [ ] Update api_contract.json with mafia_members field

### Per-Agent Personality
Allows operators to give each agent a distinct character, making games more
interesting and enabling LLM agents to stay in-character across turns.

- [ ] Add optional `persona` field to player registration (POST /games body)
      → Example: "You are paranoid and tend to accuse the most vocal player."
- [ ] Add `persona` column to players table
- [ ] Include `agent_persona` in every tick payload sent to that agent
      → The agent's LLM can use this as a system prompt or behavioral guide
- [ ] Update api_contract.json with agent_persona field

---

## V3 (Future) — Public Platform
Transforms the project from an operator-run tool into a platform anyone can use.
Introduces user accounts, self-service agent registration, and public matchmaking.

### Authentication
- [ ] Enable Supabase Auth (email/password + GitHub OAuth)
- [ ] Add user session to frontend (login/logout, protected routes)
- [ ] Add `users` table — id, email, created_at

### Agent Registration
- [ ] Add `agents` table — id, user_id, agent_name, webhook_url, created_at
- [ ] POST /agents — register a new agent (authenticated)
- [ ] GET /agents — list agents owned by the authenticated user
- [ ] DELETE /agents/:id — deregister an agent
- [ ] Agent registration UI in the frontend
      → Form: agent name + webhook URL
      → List of user's registered agents with status (active/inactive)
- [ ] Webhook health check — on registration, send a test ping to the webhook URL
      and reject registration if it doesn't respond with 200

### Matchmaking
- [ ] POST /queue — add a registered agent to the matchmaking queue
- [ ] POST /queue/leave — remove an agent from the queue
- [ ] Background matchmaker process — when enough agents are queued to fill a game
      (per DEFAULT_CONFIG), automatically create and start a game
- [ ] Notify agents via their webhook when they have been matched into a game
      → Payload: { event: 'game_starting', game_id, role: ... }

### Public Game Browser
- [ ] Public game list on home page (no login required to watch)
- [ ] Filter games by status (live / completed)
- [ ] Game detail page shows winner banner and final player roster when completed
- [ ] Update Supabase RLS policies to allow anon SELECT on agents table

### Basic Leaderboards
- [ ] Add win_count, loss_count, games_played columns to agents table
      → Updated by the GM server at game completion
- [ ] GET /leaderboard — returns agents ranked by win rate (min 5 games played)
- [ ] Leaderboard page in the frontend

---

## V4 (Future) — Competitive & Social
Deepens the competitive layer and adds social features for spectators and players.

### ELO Rating System
- [ ] Add `elo` column to agents table (default: 1000)
- [ ] After each completed game, recalculate ELO for all participants
      → Winners gain points, losers lose points, scaled by opponent strength
      → Jester win counted separately (bonus ELO, not a team win)
- [ ] Display ELO on leaderboard and agent profile pages
- [ ] ELO history chart on agent profile (line chart of rating over time)

### Tournament System
- [ ] Tournament data model — tournaments table with bracket/round-robin mode
- [ ] POST /tournaments — create a tournament (operator or authenticated user)
- [ ] Auto-seed registered agents into tournament brackets
- [ ] Tournament bracket UI — show match progression and current standings
- [ ] Tournament winner determined by points across multiple games:
      → Win: 3 pts, Survival (town, lost): 1 pt, Mafia eliminated: 0 pts, Jester win: 4 pts

### Per-Agent Analytics
- [ ] Agent profile page — accessible at /agents/:id
- [ ] Stats displayed:
      → Win rate overall and broken down by role
      → Average survival time (turns alive per game)
      → Voting accuracy (how often did the agent vote for mafia during day?)
      → Times accused vs. times the accusation was correct
- [ ] action_logs mining — derive stats from existing log data, no schema changes needed

### Spectator Features
- [ ] Spectator reaction bar — live emoji reactions logged to a new `reactions` table
      (no login required; rate-limited by IP)
- [ ] Spectator chat — authenticated users can post comments during a live game
      → New `spectator_messages` table; displayed in a sidebar on the game page
- [ ] Game replay — step through a completed game turn-by-turn using a scrubber UI
      → Reads from action_logs; no new data needed
- [ ] Highlight reel — operator can flag notable action_log entries as highlights
      → Surfaced on a /highlights page and linked from completed game pages
