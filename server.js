const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

const rooms = {}; // roomId -> { players: [...], settings: {size, mines}, winner, winTime }

io.on('connection', (socket) => {
  socket.on('join', (room, name, size, mines) => {
    socket.join(room);
    socket.room = room;
    socket.name = name;

    if (!rooms[room]) {
      rooms[room] = { 
        players: [], 
        settings: { size: size || 10, mines: mines || 15 },
        winner: null,
        winTime: null
      };
    }

    // Если первый игрок — устанавливаем настройки
    if (rooms[room].players.length === 0) {
      rooms[room].settings.size = size || 10;
      rooms[room].settings.mines = mines || (size === 8 ? 10 : size === 10 ? 15 : size === 16 ? 40 : 80);
    }

    const existing = rooms[room].players.find(p => p.name === name);
    if (!existing) rooms[room].players.push({ id: socket.id, name, progress: 0, time: '00:00', board: null });

    if (rooms[room].players.length === 2) {
      io.to(room).emit('start', rooms[room].settings);
    }

    io.to(room).emit('chat', { user: 'Система', text: `${name} зашёл! Поле: ${rooms[room].settings.size}×${rooms[room].settings.size} (${rooms[room].settings.mines} мин)` });
  });

  socket.on('progress', (data) => {
    if (!rooms[data.room]) return;
    const player = rooms[data.room].players.find(p => p.id === socket.id);
    if (player) {
      player.progress = data.percent;
      player.time = data.time;
      player.board = data.board;
    }

    const opp = rooms[data.room].players.find(p => p.id !== socket.id);
    if (opp) {
      socket.to(socket.room).emit('update', {
        oppProgress: player.progress,
        oppTime: player.time,
        oppVisible: player.board,
        winner: rooms[data.room].winner,
        winTime: rooms[data.room].winTime
      });
    }
  });

  socket.on('win', (room, winTime) => {
    if (!rooms[room].winner) {
      const winner = rooms[room].players.find(p => p.id === socket.id);
      rooms[room].winner = winner.name;
      rooms[room].winTime = winTime;
      io.to(room).emit('update', { winner: winner.name, winTime });
      io.to(room).emit('chat', { user: 'Система', text: `🎉 ${winner.name} ПОБЕДИЛ за ${winTime}!` });
    }
  });

  socket.on('chat', (msg) => {
    io.to(msg.room).emit('chat', { user: msg.user, text: msg.text });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сапёр PRO на ${PORT}`));