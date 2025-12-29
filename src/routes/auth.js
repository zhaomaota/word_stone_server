const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db/prisma');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 生成唯一邀请码
function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// POST /api/auth/register - 注册
router.post('/register', async (req, res) => {
  try {
    const { username, password, inviteCode } = req.body;

    // 验证输入
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: '用户名和密码不能为空' 
      });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ 
        success: false, 
        error: '用户名长度必须在3-20个字符之间' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: '密码长度至少6位' 
      });
    }

    // 检查用户名是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { username }
    });

    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: '用户名已被使用' 
      });
    }

    // 处理邀请码
    let invitedById = null;
    if (inviteCode) {
      const inviter = await prisma.user.findUnique({
        where: { inviteCode }
      });

      if (!inviter) {
        return res.status(400).json({ 
          success: false, 
          error: '邀请码无效' 
        });
      }

      invitedById = inviter.id;
    }

    // 生成密码哈希
    const passwordHash = await bcrypt.hash(password, 10);

    // 生成唯一邀请码
    let userInviteCode;
    let isUnique = false;
    while (!isUnique) {
      userInviteCode = generateInviteCode();
      const existing = await prisma.user.findUnique({
        where: { inviteCode: userInviteCode }
      });
      if (!existing) {
        isUnique = true;
      }
    }

    // 创建用户
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        inviteCode: userInviteCode,
        invitedById
      }
    });

    // 生成 JWT Token
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username,
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      data: {
        userId: user.id,
        username: user.username,
        role: user.role,
        inviteCode: user.inviteCode,
        token
      }
    });

  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

// POST /api/auth/login - 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: '用户名和密码不能为空' 
      });
    }

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: '用户名或密码错误' 
      });
    }

    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        error: '用户名或密码错误' 
      });
    }

    // 检查是否被封禁
    if (user.isBanned) {
      return res.status(403).json({ 
        success: false, 
        error: '账号已被封禁' 
      });
    }

    // 更新最后登录时间
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // 生成 JWT Token
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username,
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      data: {
        userId: user.id,
        username: user.username,
        role: user.role,
        token,
        user: {
          totalRoses: user.totalRoses,
          level: user.level,
          consecutiveDays: user.consecutiveDays
        }
      }
    });

  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

// POST /api/auth/logout - 登出
router.post('/logout', authenticateToken, async (req, res) => {
  // 在实际应用中，可以在这里将 token 加入黑名单
  res.json({ success: true });
});

// GET /api/auth/verify - 验证 Token
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        username: true,
        role: true,
        isBanned: true
      }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: '用户不存在' 
      });
    }

    if (user.isBanned) {
      return res.status(403).json({ 
        success: false, 
        error: '账号已被封禁' 
      });
    }

    res.json({
      success: true,
      data: {
        userId: user.id,
        username: user.username,
        role: user.role
      }
    });

  } catch (error) {
    console.error('验证错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

module.exports = router;
