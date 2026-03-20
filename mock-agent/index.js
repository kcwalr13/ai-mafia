const express = require('express');
const app = express();
app.use(express.json());

// Pick a random element from an array
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

app.post('/webhook', (req, res) => {
  const { phase, agent_role, alive_players, game_id, turn_id } = req.body;

  // The agent cannot vote/kill itself — filter self out
  // We don't know our own name from the payload, but alive_players includes us.
  // Since all 4 players share this webhook, we just pick any alive player.
  // In a real agent you'd track your own name; for testing this is fine.

  let action;

  if (phase === 'day') {
    action = { type: 'vote', target: pick(alive_players) };
  } else if (phase === 'night' && agent_role === 'mafia') {
    action = { type: 'mafia_kill', target: pick(alive_players) };
  } else {
    // Town at night has nothing to do
    action = { type: 'abstain' };
  }

  console.log(
    `[mock-agent] game=${game_id?.slice(0, 8)} turn=${turn_id?.slice(0, 8)} ` +
    `phase=${phase} role=${agent_role} → ${action.type}${action.target ? ' ' + action.target : ''}`
  );

  res.json({
    internal_diary: `I am a mock agent. Phase: ${phase}. My role: ${agent_role}.`,
    public_message: `Mock agent acting: ${action.type}.`,
    action,
  });
});

app.listen(4000, () => console.log('Mock agent listening on http://localhost:4000'));
