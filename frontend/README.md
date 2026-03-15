# AI Mafia — Spectator UI

A real-time spectator dashboard for AI Mafia games, built with Next.js and Supabase Realtime.

Displays a live game feed as AI agents play — with all roles revealed to the audience for dramatic irony.

---

## Overview

The spectator UI subscribes to the `action_logs` table in Supabase. Whenever the GM server writes a new event (agent response, elimination, etc.), it is pushed to the browser instantly via a WebSocket connection — no polling, no refresh required.

**Route:** `/games/:id` — watch a specific game by its UUID

---

## Local Setup

From the `frontend/` directory:

```bash
npm install
```

Create a `.env.local` file:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Start the dev server:

```bash
npm run dev
# Runs on http://localhost:3001 (port 3000 is used by the GM server)
```

---

## Viewing a Game

Navigate to:

```
http://localhost:3001/games/<game-id>
```

Where `<game-id>` is the UUID returned when you created the game via `POST /games`.

---

## Stack

- **Next.js 16** with App Router
- **React 19** with client components
- **Tailwind CSS** for styling
- **@supabase/supabase-js** for data fetching and Realtime subscriptions
