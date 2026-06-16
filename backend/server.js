const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const app = express();
const http = require('http');
const PORT = 8081;
const path = require('path');

const server = http.createServer(app);

const wss = new WebSocketServer({ 
  server: server,
  path: '/update_cursor_position' 
});

var number_of_connected_clients = 0;

function update_cursor_position(x_pos, y_pos, x_vector, y_vector) {

  const messageData = {
    x_pos: x_pos,
    y_pos: y_pos,
    x_vector: x_vector,
    y_vector: y_vector
  };

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(messageData));
    }
  });
}


app.use(express.static(path.join(__dirname, '.')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '.', 'test.html'));
});

wss.on('connection', (ws) => {
  number_of_connected_clients += 1;

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    const x_pos = data.x_pos;
    const y_pos = data.y_pos;
    const x_vector = data.x_vector;
    const y_vector = data.y_vector;

    update_cursor_position(x_pos, y_pos, x_vector, y_vector);
  });

  ws.on('close', () => {
    number_of_connected_clients -= 1;
  });
});


app.get('/api/number_of_connected_clients', (req, res) => {
  return res.json({ number_of_connected_clients: number_of_connected_clients });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Example app listening at http://localhost:${PORT}`);
});