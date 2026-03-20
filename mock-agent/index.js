const express = require('express');
const app = express();
app.use(express.json());

// Pick a random element from an array
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

app.post('/webhook', (req, res) => {
  const { phase, agent_role, alive_players, mafia_members, game_id, turn_id } = req.body;

  // For night kills, target a non-mafia player using the mafia_members list.
  // For votes, pick any alive player (we don't know our own name here).
  const townPlayers = mafia_members
    ? alive_players.filter(name => !mafia_members.includes(name))
    : alive_players;

  let action;

  if (phase === 'day') {
    action = { type: 'vote', target: pick(alive_players) };
  } else if (phase === 'night' && agent_role === 'mafia') {
    // Kill a town player if possible, otherwise fall back to any alive player
    action = { type: 'mafia_kill', target: pick(townPlayers.length ? townPlayers : alive_players) };
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
