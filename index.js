const express = require('express');
const { z } = require('zod');
const app = express();

app.use(express.json());

const AgentResponseSchema = z.object({
  api_version: z.string(),
  game_id: z.string(),
  turn_id: z.string(),
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

app.listen(3000, () => {
    console.log('GM server is running on port 3000');
});