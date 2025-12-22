const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const users = new Map();

io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  socket.on('join', ({ username, inventory }) => {
    users.set(socket.id, { username, inventory });
    
    io.emit('users-update', Array.from(users.entries()).map(([id, data]) => ({
      id,
      username: data.username,
      vocabCount: Object.keys(data.inventory).length
    })));

    io.emit('message', {
      type: 'sys',
      content: `> [${username}] 已连接到服务器。`,
      timestamp: Date.now()
    });
  });

  socket.on('send-message', ({ html, tokens }) => {
    const user = users.get(socket.id);
    if (!user) return;

    // 验证用户是否拥有这些词汇
    const valid = tokens.every(token => {
      const word = token.toLowerCase();
      return Object.keys(user.inventory).some(w => w.toLowerCase() === word);
    });

    if (!valid) {
      // ❌ 验证失败：只发给发送者本人（不显示用户消息）
      socket.emit('message', {
        type: 'sys',
        content: ' ACCESS DENIED: 检测到非法词汇！消息未发送。',
        isError: true,
        timestamp: Date.now()
      });
      return;
    }

    // ✅ 验证通过：广播给所有人（包括发送者自己）
    io.emit('message', {
      type: 'user',
      username: user.username,
      content: html,
      timestamp: Date.now()
    });
  });

  socket.on('update-inventory', (inventory) => {
    const user = users.get(socket.id);
    if (user) {
      user.inventory = inventory;
      
      io.emit('users-update', Array.from(users.entries()).map(([id, data]) => ({
        id,
        username: data.username,
        vocabCount: Object.keys(data.inventory).length
      })));
    }
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      io.emit('message', {
        type: 'sys',
        content: `> [${user.username}] 已断开连接。`,
        timestamp: Date.now()
      });
      users.delete(socket.id);
      
      io.emit('users-update', Array.from(users.entries()).map(([id, data]) => ({
        id,
        username: data.username,
        vocabCount: Object.keys(data.inventory).length
      })));
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
});
