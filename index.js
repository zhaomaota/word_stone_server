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

// 存储用户数据（包含总鲜花数）
const users = new Map();

// 存储消息数据（包含鲜花数）
const messages = new Map();

// 防止重复送花：记录每个用户对每条消息的送花状态
// 格式：Map<messageId, Set<username>>
const messageRoseSenders = new Map();

// 速率限制：记录用户最后一次送花时间
const userLastRoseTime = new Map();

io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  socket.on('join', ({ username, inventory }) => {
    // 初始化用户数据，包含总鲜花数
    users.set(socket.id, { 
      username, 
      inventory,
      totalRoses: 0  // 初始化总鲜花数
    });
    
    // 发送用户列表更新（包含鲜花数）
    io.emit('users-update', Array.from(users.entries()).map(([id, data]) => ({
      id,
      username: data.username,
      vocabCount: Object.keys(data.inventory).length,
      roses: data.totalRoses || 0  // 添加鲜花数
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
      // ❌ 验证失败：只发给发送者本人
      socket.emit('message', {
        type: 'sys',
        content: ' ACCESS DENIED: 检测到非法词汇！消息未发送。',
        isError: true,
        timestamp: Date.now()
      });
      return;
    }

    // ✅ 验证通过：生成消息ID并存储
    const messageId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const messageData = {
      id: messageId,
      type: 'user',
      username: user.username,
      content: html,
      roses: 0,  // 初始鲜花数为0
      timestamp: Date.now()
    };

    // 存储消息
    messages.set(messageId, messageData);

    // 广播给所有人
    io.emit('message', messageData);

    // 清理旧消息（保留最近100条）
    if (messages.size > 100) {
      const oldestKey = messages.keys().next().value;
      messages.delete(oldestKey);
      messageRoseSenders.delete(oldestKey);
    }
  });

  // 🌹 送花功能
socket.on('send-rose', ({ targetUsername, messageId }) => {
  const sender = users.get(socket.id);
  if (!sender) {
    socket.emit('error', { message: '用户未登录' });
    return;
  }

  const message = messages.get(messageId);
  if (!message) {
    socket.emit('error', { message: '消息不存在' });
    return;
  }

  if (message.username === sender.username) {
    socket.emit('error', { message: '不能给自己送花哦~' });
    return;
  }

  if (!messageRoseSenders.has(messageId)) {
    messageRoseSenders.set(messageId, new Set());
  }
  const senders = messageRoseSenders.get(messageId);

  // 找到接收者对象
  let receiver = null;
  let receiverSocketId = null;
  for (const [sid, userData] of users.entries()) {
    if (userData.username === targetUsername) {
      receiver = userData;
      receiverSocketId = sid;
      break;
    }
  }
  if (!receiver) {
    socket.emit('error', { message: '接收者不在线' });
    return;
  }

  const now = Date.now();
  const lastTime = userLastRoseTime.get(sender.username) || 0;
  if (!senders.has(sender.username) && (now - lastTime < 1000)) {
    socket.emit('error', { message: '送花太快了，请稍后再试' });
    return;
  }

  // 切换逻辑：如果已经送过 -> 取消；否则新增
  let action;
  if (senders.has(sender.username)) {
    // 取消送花
    senders.delete(sender.username);
    message.roses = Math.max(0, (message.roses || 0) - 1);
    receiver.totalRoses = Math.max(0, (receiver.totalRoses || 0) - 1);
    userLastRoseTime.set(sender.username, now);
    action = 'removed';
  } else {
    // 新增送花
    senders.add(sender.username);
    message.roses = (message.roses || 0) + 1;
    receiver.totalRoses = (receiver.totalRoses || 0) + 1;
    userLastRoseTime.set(sender.username, now);
    action = 'added';
  }

  // 广播更新（明确字段：messageId, roses, totalRoses, sender, receiver, action）
  io.emit('rose-update', {
    messageId,
    roses: message.roses,
    totalRoses: receiver.totalRoses,
    sender: sender.username,
    receiver: receiver.username,
    action
  });

  // 广播更新在线用户列表（包含每人 totalRoses）
  io.emit('users-update', Array.from(users.entries()).map(([id, data]) => ({
    id,
    username: data.username,
    vocabCount: Object.keys(data.inventory || {}).length,
    roses: data.totalRoses || 0
  })));
});

  socket.on('update-inventory', (inventory) => {
    const user = users.get(socket.id);
    if (user) {
      user.inventory = inventory;
      
      io.emit('users-update', Array.from(users.entries()).map(([id, data]) => ({
        id,
        username: data.username,
        vocabCount: Object.keys(data.inventory).length,
        roses: data.totalRoses || 0  // 保留鲜花数
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
        vocabCount: Object.keys(data.inventory).length,
        roses: data.totalRoses || 0
      })));
    }
  });
});

// 定期清理旧数据（每小时清理一次超过24小时的消息）
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, msg] of messages) {
    if (msg.timestamp < cutoff) {
      messages.delete(id);
      messageRoseSenders.delete(id);
      console.log(`🗑️ 清理旧消息: ${id}`);
    }
  }
}, 60 * 60 * 1000);

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
  console.log(`🌹 送花功能已启用`);
});
