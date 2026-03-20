# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Backend (run from `/`):**
- **Start server**: `npm start` (runs on port 3000)
- **Tests**: `npm test` (not yet implemented)

**Frontend (run from `/frontend`):**
- **Dev server**: `npm run dev` (runs on port 3001)
- **Build**: `npm run build`

## Architecture

This is a Game Master (GM) server for an AI Mafia game. It manages the full game lifecycle: creating games, assigning roles, dispatching game state to AI agents via webhooks, collecting and validating their responses, resolving votes and night kills, and detecting win conditions.

**Entry point**: `index.js` — a single-file Express 5 app with the following endpoints:
- `GET /` — health check
- `GET /db-health` — SELECT query to verify the database connection
- `POST /games` — creates a new game and registers players
- `GET /games` — lists all games, newest first
- `GET /games/:id` — returns a single game with its players
- `POST /games/:id/start` — assigns roles and transitions game to `in_progress`
- `POST /games/:id/tick` — dispatches game state to all alive agents, collects responses, logs results to action_logs, transitions game to `waiting_for_resolve`
- `POST /games/:id/resolve` — tallies votes/kills, eliminates players, checks win conditions, transitions game to `in_progress` (next phase) or `completed`
- `POST /games/:id/run` — fires a background tick→resolve loop that runs the game to completion (responds 202 immediately). Not crash-safe.

The tick and resolve logic lives in `performTick(gameId)` and `performResolve(gameId)` — standalone async functions called by both the route handlers and the automated game loop. They throw errors with a `statusCode` property on validation failures.

**`POST /games` request body:**
```
players   — required array of { agent_name, webhook_url }, min 1 entry
config    — optional game config override (see DEFAULT_CONFIG in index.js)
```
Validates player count against `config.min_players` / `config.max_players`, and that total role counts equal exactly the number of players. Returns 201 with the created game and players.

**`DEFAULT_CONFIG`** (defined in `index.js`):
```
min_players: 4
max_players: 10
roles: { town: 3, mafia: 1 }
```

**Agent response schema** (defined in `index.js`, matches `api_contract.json`):
```
internal_diary, public_message         — optional strings
direct_messages                        — optional array of { to, message }
action                                 — required: { type: 'vote'|'abstain'|'mafia_kill'|'investigate'|'protect', target? }
```

Returns 400 with Zod error details on invalid payloads, 200 with validated data on success.

## Stack

**Backend (`/`):**
- **Node.js** with CommonJS (`require`/`module.exports`)
- **Express 5** for routing
- **Zod 4** for schema validation
- **@supabase/supabase-js** for database access
- **dotenv** for loading environment variables from `.env`

**Frontend (`/frontend`):**
- **Next.js 16** with App Router
- **React** with client components (`'use client'`)
- **Tailwind CSS** for styling
- **@supabase/supabase-js** for data fetching and Realtime subscriptions
- Dev server runs on port 3001 (3000 is taken by the GM server)

## Project Vision & Roadmap

This is a "Bring Your Own Agent" (BYOA) platform where users submit webhook URLs 
connecting to their custom LLM agents. Agents compete in automated games of Mafia 
managed by this central GM server.

**V1 (complete):** Tick-based game loop, Town and Mafia roles only, synchronous
responses, basic spectator UI via Supabase Realtime + Next.js frontend.

**V2 (future):** Structured conversation rounds, full role roster (Cop, Medic, 
Jester), per-agent personality prompting.

**V3 (future):** Async real-time chat, public BYOA registration, tournaments, 
leaderboards.

## Source of Truth

- `api_contract.json` — defines all GM↔Agent communication schemas. Never change 
  endpoint behavior without updating this file first.
- `system_architecture.md` — high level component overview.

## Local Setup (from scratch)

1. `npm install` — install backend dependencies
2. Create `.env` in the project root with `SUPABASE_URL` and `SUPABASE_ANON_KEY`
3. Run the full database schema SQL in Supabase (see `README.md`)
4. `npm start` — start the GM server
5. `cd frontend && npm install` — install frontend dependencies
6. Create `frontend/.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
7. `cd frontend && npm run dev` — start the spectator UI

**Mock agent (for local testing, run from `/mock-agent`):**
- `npm install` — install dependencies (first time only)
- `node index.js` — starts a fake agent on port 4000 that responds immediately
- Use `bash test-game.sh` to create, start, and run a full game in one command

## Known Issues (Next Session)

The V1 Polish backlog is nearly complete. One item remains:

1. **Supabase RLS not enabled** — The browser anon key has write access to all tables. Requires enabling RLS on all tables and switching the GM server to use `SUPABASE_SERVICE_ROLE_KEY`.
2. **Game loop is not crash-safe** — `POST /games/:id/run` fires a background async loop that dies if the server restarts. A future session should implement a polling-based recovery (e.g., on startup, scan for stalled `in_progress` games and resume them).

## Mentorship Notes

The human working on this project is a beginner to backend development. Always:
- Explain what you're about to do before doing it
- Wait for confirmation before writing to any file
- Break changes into small reviewable pieces
- Define any jargon or new concepts introduced

## Database

Supabase (PostgreSQL). Connection is configured in `db.js` using credentials from `.env`.

Current tables and notable columns:
- `games` — tracks active, pending, and completed matches
  - `status`: `'pending'` | `'in_progress'` | `'waiting_for_resolve'` | `'completed'`
  - `phase`: `'lobby'` | `'day'` | `'night'`
  - `config`: JSONB game configuration (see `DEFAULT_CONFIG` in `index.js`)
  - `turn_number`: increments each tick
  - `day_number`: increments each night→day transition
  - `winner`: `null` | `'town'` | `'mafia'` — set when game is completed
- `players` — agents registered to a game with their roles and webhook URLs
  - `role`: `'unassigned'` | `'town'` | `'mafia'` (more in V2)
  - `is_alive`: boolean
  - `consecutive_failures`: resets to 0 on success, reaches 3 → player killed
- `action_logs` — append-only ledger of every agent response and elimination event
  - `entry_type`: `'agent_response'` | `'elimination'`
  - `payload`: JSONB — shape varies by entry_type

The GM server must be stateless — all game state lives in the database so the
server can crash and recover without losing anything.