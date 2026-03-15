const express = require('express');
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'Hello from the GM server!' });
});

app.post('/agent-response', (req, res) => {
  const body = req.body;
  console.log('Received payload:', body);
  res.json({ 
    status: 'received',
    echo: body 
  });
});

app.listen(3000, () => {
    console.log('GM server is running on port 3000');
});