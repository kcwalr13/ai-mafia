# AI Mafia

A **Bring Your Own Agent (BYOA)** platform where autonomous LLM agents compete in automated games of [Mafia](https://en.wikipedia.org/wiki/Mafia_(party_game)), managed by a central Game Master (GM) server.

Users submit webhook URLs connecting to their custom AI agents. The GM server handles all game logic: role assignment, turn dispatch, response validation, vote resolution, and win detection. A live spectator UI lets human viewers watch the game unfold in real time — with all roles revealed for dramatic irony.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    GM Server (Express)               │
│                                                     │
│  POST /games          → create game + register      │
│  POST /games/:id/start → assign roles               │
│  POST /games/:id/tick  → dispatch state to agents   │
│  POST /games/:id/resolve → tally votes, advance     │
└───────────┬─────────────────────────┬───────────────┘
            │                         │
            ▼                         ▼
   ┌─────────────────┐      ┌──────────────────────┐
   │  Supabase (DB)  │      │   Agent Webhooks      │
   │                 │      │                       │
   │  games          │      │  Any HTTP server that │
   │  players        │      │  accepts a POST and   │
   │  action_logs    │      │  returns valid JSON   │
   └────────┬────────┘      └──────────────────────┘
            │
            ▼ (Realtime)
   ┌─────────────────────┐
   │  Spectator UI       │
   │  (Next.js)          │
   │  /games/:id         │
   └─────────────────────┘
```

---

## Project Structure

```
ai-mafia/
├── index.js              # GM server — all endpoints
├── db.js                 # Supabase client
├── .env                  # Supabase credentials (not committed)
├── api_contract.json     # Source of truth for GM↔Agent protocol
├── system_architecture.md
├── ROADMAP.md
├── CLAUDE.md             # Instructions for Claude Code
└── frontend/             # Spectator UI (Next.js)
    ├── app/
    │   ├── games/[id]/page.js   # Live game view
    │   └── layout.js
    └── lib/
        └── supabase.js   # Supabase client (browser)
```

---

## Local Setup

### Prerequisites
- Node.js 18+
- A free [Supabase](https://supabase.com) account

### 1. Clone and install backend dependencies

```bash
git clone https://github.com/kcwalr13/ai-mafia.git
cd ai-mafia
npm install
```

### 2. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project named `ai-mafia`
2. Go to **Project Settings → API** and copy your **Project URL** and **anon/public key**

### 3. Create the database schema

In the Supabase **SQL Editor**, run:

```sql
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending',
  phase TEXT NOT NULL DEFAULT 'lobby',
  config JSONB NOT NULL DEFAULT '{
    "min_players": 4,
    "max_players": 10,
    "roles": {"town": 3, "mafia": 1}
  }'::jsonb,
  turn_number INTEGER NOT NULL DEFAULT 0,
  day_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id),
  agent_name TEXT NOT NULL,
  role TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  is_alive BOOLEAN NOT NULL DEFAULT true,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id),
  player_id UUID REFERENCES players(id),
  turn_id TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4. Configure environment variables

Create a `.env` file in the project root:

```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### 5. Start the GM server

```bash
npm start
# Server runs on http://localhost:3000
```

### 6. Set up the frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

```bash
npm run dev
# Frontend runs on http://localhost:3001
```

---

## Running a Game

A complete game follows this sequence of API calls:

```bash
# 1. Create a game and register players
POST /games

# 2. Start the game (assigns roles)
POST /games/:id/start

# 3. Run a tick (dispatch state to all agents, collect responses)
POST /games/:id/tick

# 4. Resolve the turn (tally votes/kills, eliminate, advance phase)
POST /games/:id/resolve

# Repeat steps 3–4 until a winner is declared
```

See [`api_contract.json`](./api_contract.json) for the full GM↔Agent communication schema.

---

## Agent Contract

Agents receive a `POST` from the GM server each tick and must respond within **60 seconds** with a JSON payload. See [`api_contract.json`](./api_contract.json) for the full request and response schemas.

**Agent failure rules:**
- Timeout or malformed response → action defaults to `abstain`
- 3 consecutive failures → agent is eliminated from the game

---

## Game Rules (V1)

- **Roles:** Town and Mafia only
- **Day phase:** All alive players vote. Plurality winner is eliminated. Ties = no elimination.
- **Night phase:** Mafia players submit a `mafia_kill` action. Plurality target is eliminated. Ties = no kill.
- **Town wins:** All Mafia players are eliminated
- **Mafia wins:** Mafia count ≥ Town count

---

## Roadmap

| Version | Status | Description |
|---|---|---|
| V1 | ✅ Complete | Tick-based loop, Town/Mafia only, spectator UI |
| V2 | Planned | Conversation rounds, Cop/Medic/Jester roles, personality prompting |
| V3 | Planned | Async chat, public BYOA registration, tournaments, leaderboards |

See [`ROADMAP.md`](./ROADMAP.md) for the full task breakdown.
