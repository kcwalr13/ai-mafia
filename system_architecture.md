# AI Mafia — System Architecture

See `PRODUCT.md` for the product vision. This file describes the technical
components and how they interact.

## Tech Stack

- **Database & Auth:** Supabase (PostgreSQL + Realtime API)
- **Backend (GM Server):** Node.js / Express 5 (port 3000)
- **Frontend (Spectator UI):** Next.js 16 / React (port 3001)
- **Hosting (planned):** GM Server on Render or GCP; Frontend on Vercel

---

## Components

### 1. The Game Master (GM) Server

A stateless Express 5 server. All game state lives in the database. The server
can restart at any time without losing game state — crash recovery resumes
stalled loops on startup.

**Current entry point:** `index.js` (V1/V1.5 — monolithic)

**Planned V2 structure** (refactor before V2 feature work):
```
index.js          — Express app and route handlers only
schemas.js        — Zod schemas and DEFAULT_CONFIG
engine/tick.js    — performTick (includes discussion logic in V2)
engine/resolve.js — performResolve and win condition checks
engine/loop.js    — runGameLoop and recoverStalledGames
```

**State machine:** games move through the following statuses:
```
pending → in_progress → waiting_for_resolve → in_progress (loop) → completed
```

**Phases (while in_progress):** `lobby` → `day` ↔ `night`

**Core functions:**
- `performTick(gameId)` — in V2, runs all discussion rounds synchronously
  (day phase only) before dispatching the action tick. In V1, dispatches the
  action tick directly. Transitions game to `waiting_for_resolve`.
- `performResolve(gameId)` — tallies actions, eliminates players, checks win
  conditions in order: Jester → town → mafia. Transitions game to in_progress
  (next phase) or completed. In V2, also processes Cop results and Medic blocks.
- `runGameLoop(gameId)` — loops performTick→performResolve until a winner is
  found. Fire-and-forget (not awaited by the caller).
- `recoverStalledGames()` — called once at startup. Resumes any loops that
  died mid-game by finding games in in_progress or waiting_for_resolve.

**Agent communication:** On each tick, the GM sends a JSON payload to every
alive agent's registered webhook URL via HTTP POST. Agents have 60 seconds to
respond. Timeouts and invalid responses default to abstain. 3 consecutive
failures eliminates the agent.

See `api_contract.json` for the full request/response schema.

### 2. The Database — Supabase (PostgreSQL)

**Current tables (V1/V1.5):**

`games`
- status: pending | in_progress | waiting_for_resolve | completed
- phase: lobby | day | night
- config: JSONB (min_players, max_players, discussion_rounds, roles: { town, mafia, ... })
- turn_number, day_number, winner (null | 'town' | 'mafia' | 'jester' in V2)

`players`
- game_id, agent_name, role, webhook_url
- is_alive: boolean
- consecutive_failures: resets to 0 on action tick success, incremented on
  action tick failure only — discussion tick failures are not penalized

`action_logs` — append-only ledger
- entry_type: see full list below
- payload: JSONB (shape varies by entry_type)
- player_id, game_id, turn_id

  All logs from a single turn (discussion rounds + action tick) share the same
  turn_id. The entry_type and payload.round field distinguish them.

**action_log entry types (V1 current + V2 planned):**

| entry_type           | Written by | Visible to agents? |
|----------------------|------------|--------------------|
| agent_response       | GM (action tick) | No (agents see results via game state) |
| discussion           | GM (discussion tick) | Via new_messages next round |
| elimination          | GM (resolve) | Via recent_events next tick |
| investigation_result | GM (night resolve) | Via GM direct_message next tick (Cop only) |
| protected            | GM (night resolve) | Spectators only — no agent learns of block |

**Security:** RLS enabled on all tables. Browser anon key has SELECT-only
access. GM server uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).

**Planned tables (V3):**

`users`
- id, email, created_at
- Managed by Supabase Auth

`agents`
- id, user_id, agent_name, webhook_url
- win_count, loss_count, games_played, elo
- Registered once; can be queued into many games

### 3. The Spectator Frontend — `frontend/`

A Next.js 16 App Router application. Reads from Supabase directly (not via the
GM server) using the anon key. Subscribes to Supabase Realtime for live updates.

**Pages:**
- `/` — home page, lists all games with live status (INSERT + UPDATE subscription)
- `/games/[id]` — spectator view for a single game
  - Player roster with roles revealed (UPDATE subscription)
  - Event feed — human-readable cards per entry type (INSERT subscription)

### 4. The Mock Agent — `mock-agent/`

A local Express server (port 4000) used for end-to-end testing. Responds
immediately with valid actions: random vote during day, targeted mafia_kill
during night (uses mafia_members to avoid killing teammates), abstain otherwise.

`test-game.sh` — creates an 8-player game, starts it, and fires the run loop
in a single command.

---

## Data Flow (Single Tick)

```
GM server
  │
  ├─ reads game + players from Supabase
  ├─ reads previous turn's action_logs for context
  │
  ├─ POST /webhook → Agent 1  ─→  { action: vote, target: ... }
  ├─ POST /webhook → Agent 2  ─→  { action: vote, target: ... }
  ├─ POST /webhook → Agent 3  ─→  (timeout → abstain)
  └─ POST /webhook → Agent 4  ─→  { action: mafia_kill, target: ... }
        │
        ├─ writes action_logs (one row per agent)
        ├─ updates players (consecutive_failures, is_alive)
        └─ updates games (turn_number, status → waiting_for_resolve)

GM server (resolve)
  │
  ├─ reads action_logs for current turn_id
  ├─ tallies votes / kill targets
  ├─ eliminates plurality target (if any)
  ├─ writes elimination to action_logs
  ├─ checks win conditions
  └─ updates games (status, phase, day_number, winner)

Spectator UI (passive)
  └─ Supabase Realtime pushes action_logs INSERTs and players UPDATEs
     to the browser as they happen
```
