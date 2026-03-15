const express = require('express');
const { z } = require('zod');
const { randomUUID } = require('crypto');
const supabase = require('./db');
const app = express();

app.use(express.json());

const DEFAULT_CONFIG = {
  min_players: 4,
  max_players: 10,
  roles: {
    town: 3,
    mafia: 1
  }
};

const GameConfigSchema = z.object({
  min_players: z.number().int().min(2).optional(),
  max_players: z.number().int().min(2).optional(),
  roles: z.record(z.string(), z.number().int().min(1)).optional()
});

const CreateGameSchema = z.object({
  players: z.array(
    z.object({
      agent_name: z.string().min(1),
      webhook_url: z.string().url()
    })
  ).min(1),
  config: GameConfigSchema.optional()
});

const AgentResponseSchema = z.object({
  internal_diary: z.string().optional(),
  public_message: z.string().optional(),
  direct_messages: z.array(
    z.object({
      to: z.string(),
      message: z.string()
    })
  ).optional(),
  action: z.object({
    type: z.enum(['vote', 'abstain', 'mafia_kill', 'investigate', 'protect']),
    target: z.string().optional()
  })
});

app.get('/', (req, res) => {
    res.json({ message: 'Hello from the GM server!' });
});

app.post('/agent-response', (req, res) => {
  const body = req.body;
  console.log('Received payload:', body);

  const result = AgentResponseSchema.safeParse(body);

  if (!result.success) {
    return res.status(400).json({
      status: 'rejected',
      errors: result.error.format()
    });
  }

  res.json({
    status: 'received',
    echo: result.data
  });
});

app.post('/games', async (req, res) => {
  const result = CreateGameSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({ status: 'rejected', errors: result.error.format() });
  }

  const { players, config: configOverride } = result.data;
  const config = { ...DEFAULT_CONFIG, ...configOverride };

  if (players.length < config.min_players) {
    return res.status(400).json({
      status: 'rejected',
      error: `At least ${config.min_players} players are required.`
    });
  }

  if (players.length > config.max_players) {
    return res.status(400).json({
      status: 'rejected',
      error: `At most ${config.max_players} players are allowed.`
    });
  }

  const totalRoles = Object.values(config.roles).reduce((sum, n) => sum + n, 0);
  if (totalRoles !== players.length) {
    return res.status(400).json({
      status: 'rejected',
      error: `Role counts must add up to exactly ${players.length} (the number of players). Current total: ${totalRoles}.`
    });
  }

  const { data: game, error: gameError } = await supabase
    .from('games')
    .insert({ status: 'pending', phase: 'lobby', config })
    .select()
    .single();

  if (gameError) {
    return res.status(500).json({ status: 'error', error: gameError.message });
  }

  const playerRows = players.map(p => ({
    game_id: game.id,
    agent_name: p.agent_name,
    role: 'unassigned',
    webhook_url: p.webhook_url
  }));

  const { data: createdPlayers, error: playersError } = await supabase
    .from('players')
    .insert(playerRows)
    .select();

  if (playersError) {
    return res.status(500).json({ status: 'error', error: playersError.message });
  }

  res.status(201).json({
    status: 'created',
    game,
    players: createdPlayers
  });
});

app.post('/games/:id/start', async (req, res) => {
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select()
    .eq('id', req.params.id)
    .single();

  if (gameError || !game) {
    return res.status(404).json({ status: 'error', error: 'Game not found.' });
  }

  if (game.status !== 'pending') {
    return res.status(400).json({
      status: 'rejected',
      error: `Game cannot be started — current status is '${game.status}'.`
    });
  }

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select()
    .eq('game_id', game.id);

  if (playersError) {
    return res.status(500).json({ status: 'error', error: playersError.message });
  }

  // Build role list from config, e.g. ['town', 'town', 'town', 'mafia']
  const roles = [];
  for (const [role, count] of Object.entries(game.config.roles)) {
    for (let i = 0; i < count; i++) roles.push(role);
  }

  // Fisher-Yates shuffle
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  // Assign roles to players in parallel
  const updates = players.map((player, i) =>
    supabase.from('players').update({ role: roles[i] }).eq('id', player.id).select().single()
  );

  const results = await Promise.all(updates);
  const failedUpdate = results.find(r => r.error);
  if (failedUpdate) {
    return res.status(500).json({ status: 'error', error: failedUpdate.error.message });
  }

  const { data: updatedGame, error: gameUpdateError } = await supabase
    .from('games')
    .update({ status: 'in_progress', phase: 'day' })
    .eq('id', game.id)
    .select()
    .single();

  if (gameUpdateError) {
    return res.status(500).json({ status: 'error', error: gameUpdateError.message });
  }

  res.json({
    status: 'started',
    game: updatedGame,
    players: results.map(r => r.data)
  });
});

app.post('/games/:id/tick', async (req, res) => {
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select()
    .eq('id', req.params.id)
    .single();

  if (gameError || !game) {
    return res.status(404).json({ status: 'error', error: 'Game not found.' });
  }

  if (game.status !== 'in_progress') {
    return res.status(400).json({
      status: 'rejected',
      error: `Tick cannot be run — game status is '${game.status}'.`
    });
  }

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select()
    .eq('game_id', game.id)
    .eq('is_alive', true);

  if (playersError) {
    return res.status(500).json({ status: 'error', error: playersError.message });
  }

  const turnNumber = game.turn_number + 1;
  const turnId = randomUUID();

  const { error: turnUpdateError } = await supabase
    .from('games')
    .update({ turn_number: turnNumber })
    .eq('id', game.id);

  if (turnUpdateError) {
    return res.status(500).json({ status: 'error', error: turnUpdateError.message });
  }

  const alivePlayers = players.map(p => p.agent_name);

  const tickResults = await Promise.all(players.map(async (player) => {
    const payload = {
      game_id: game.id,
      turn_id: turnId,
      phase: game.phase,
      day_number: game.day_number,
      agent_role: player.role,
      alive_players: alivePlayers,
      recent_events: [],
      new_messages: { public_chat: [], direct_messages: [] }
    };

    let action;
    let raw = null;
    let outcome = 'ok';

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(player.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      raw = await response.json();
      const parsed = AgentResponseSchema.safeParse(raw);

      if (parsed.success) {
        action = parsed.data.action;
      } else {
        action = { type: 'abstain' };
        outcome = 'invalid_response';
      }
    } catch (err) {
      action = { type: 'abstain' };
      outcome = err.name === 'AbortError' ? 'timeout' : 'error';
    }

    return { player, action, raw, outcome };
  }));

  // Calculate new failure counts and flag any eliminations
  const processedResults = tickResults.map(({ player, action, raw, outcome }) => {
    const newFailures = outcome === 'ok' ? 0 : player.consecutive_failures + 1;
    const eliminated = newFailures >= 3;
    return { player, action, raw, outcome, newFailures, eliminated };
  });

  // Update each player's consecutive_failures (and is_alive if eliminated)
  const failureUpdates = await Promise.all(processedResults.map(({ player, newFailures, eliminated }) => {
    const updates = { consecutive_failures: newFailures };
    if (eliminated) updates.is_alive = false;
    return supabase.from('players').update(updates).eq('id', player.id);
  }));

  const failedFailureUpdate = failureUpdates.find(r => r.error);
  if (failedFailureUpdate) {
    return res.status(500).json({ status: 'error', error: failedFailureUpdate.error.message });
  }

  const logRows = processedResults.map(({ player, action, raw, outcome }) => ({
    game_id: game.id,
    player_id: player.id,
    turn_id: turnId,
    entry_type: 'agent_response',
    payload: { action, raw, outcome }
  }));

  const { error: logError } = await supabase
    .from('action_logs')
    .insert(logRows);

  if (logError) {
    return res.status(500).json({ status: 'error', error: logError.message });
  }

  res.json({
    status: 'ok',
    turn_id: turnId,
    turn_number: turnNumber,
    results: processedResults.map(({ player, action, outcome, eliminated }) => ({
      agent_name: player.agent_name,
      action,
      outcome,
      ...(eliminated && { eliminated: true })
    }))
  });
});

app.post('/games/:id/resolve', async (req, res) => {
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select()
    .eq('id', req.params.id)
    .single();

  if (gameError || !game) {
    return res.status(404).json({ status: 'error', error: 'Game not found.' });
  }

  if (game.status !== 'in_progress') {
    return res.status(400).json({
      status: 'rejected',
      error: `Cannot resolve — game status is '${game.status}'.`
    });
  }

  // Fetch the latest turn's logs
  const { data: latestLog, error: latestLogError } = await supabase
    .from('action_logs')
    .select('turn_id')
    .eq('game_id', game.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (latestLogError || !latestLog) {
    return res.status(400).json({ status: 'rejected', error: 'No turns have been played yet.' });
  }

  const { data: logs, error: logsError } = await supabase
    .from('action_logs')
    .select()
    .eq('game_id', game.id)
    .eq('turn_id', latestLog.turn_id);

  if (logsError) {
    return res.status(500).json({ status: 'error', error: logsError.message });
  }

  const { data: alivePlayers, error: playersError } = await supabase
    .from('players')
    .select()
    .eq('game_id', game.id)
    .eq('is_alive', true);

  if (playersError) {
    return res.status(500).json({ status: 'error', error: playersError.message });
  }

  // Tally actions based on phase
  let eliminatedName = null;

  if (game.phase === 'day') {
    const voteCounts = {};
    for (const log of logs) {
      const action = log.payload.action;
      if (action.type === 'vote' && action.target) {
        voteCounts[action.target] = (voteCounts[action.target] || 0) + 1;
      }
    }
    if (Object.keys(voteCounts).length > 0) {
      const maxVotes = Math.max(...Object.values(voteCounts));
      const topTargets = Object.keys(voteCounts).filter(t => voteCounts[t] === maxVotes);
      if (topTargets.length === 1) eliminatedName = topTargets[0];
    }
  } else {
    const mafiaPlayerIds = new Set(alivePlayers.filter(p => p.role === 'mafia').map(p => p.id));
    const killCounts = {};
    for (const log of logs) {
      if (!mafiaPlayerIds.has(log.player_id)) continue;
      const action = log.payload.action;
      if (action.type === 'mafia_kill' && action.target) {
        killCounts[action.target] = (killCounts[action.target] || 0) + 1;
      }
    }
    if (Object.keys(killCounts).length > 0) {
      const maxKills = Math.max(...Object.values(killCounts));
      const topTargets = Object.keys(killCounts).filter(t => killCounts[t] === maxKills);
      if (topTargets.length === 1) eliminatedName = topTargets[0];
    }
  }

  // Eliminate the targeted player (if any)
  let eliminatedPlayer = null;
  if (eliminatedName) {
    const target = alivePlayers.find(p => p.agent_name === eliminatedName);
    if (target) {
      const { error: elimError } = await supabase
        .from('players')
        .update({ is_alive: false })
        .eq('id', target.id);

      if (elimError) {
        return res.status(500).json({ status: 'error', error: elimError.message });
      }

      eliminatedPlayer = target;

      await supabase.from('action_logs').insert({
        game_id: game.id,
        player_id: target.id,
        turn_id: latestLog.turn_id,
        entry_type: 'elimination',
        payload: {
          agent_name: target.agent_name,
          role: target.role,
          cause: game.phase === 'day' ? 'vote' : 'mafia_kill'
        }
      });
    }
  }

  // Check win conditions against updated player list
  const updatedAlivePlayers = alivePlayers.filter(p => !eliminatedPlayer || p.id !== eliminatedPlayer.id);
  const aliveMafia = updatedAlivePlayers.filter(p => p.role === 'mafia').length;
  const aliveTown = updatedAlivePlayers.filter(p => p.role !== 'mafia').length;

  let winner = null;
  if (aliveMafia === 0) winner = 'town';
  else if (aliveMafia >= aliveTown) winner = 'mafia';

  // Advance phase or end game
  let gameUpdates;
  if (winner) {
    gameUpdates = { status: 'completed' };
  } else if (game.phase === 'day') {
    gameUpdates = { phase: 'night' };
  } else {
    gameUpdates = { phase: 'day', day_number: game.day_number + 1 };
  }

  const { data: updatedGame, error: gameUpdateError } = await supabase
    .from('games')
    .update(gameUpdates)
    .eq('id', game.id)
    .select()
    .single();

  if (gameUpdateError) {
    return res.status(500).json({ status: 'error', error: gameUpdateError.message });
  }

  res.json({
    status: 'ok',
    phase_resolved: game.phase,
    eliminated: eliminatedPlayer
      ? { agent_name: eliminatedPlayer.agent_name, role: eliminatedPlayer.role }
      : null,
    winner,
    game: updatedGame
  });
});

app.get('/db-health', async (req, res) => {
  const { data, error } = await supabase
    .from('games')
    .insert({ status: 'pending', phase: 'lobby' })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ status: 'error', error: error.message });
  }

  res.json({ status: 'ok', created_game: data });
});

app.listen(3000, () => {
    console.log('GM server is running on port 3000');
});