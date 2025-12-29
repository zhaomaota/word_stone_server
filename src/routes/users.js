const express = require('express');
const bcrypt = require('bcrypt');
const prisma = require('../db/prisma');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/users/me - 获取当前用户信息
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        username: true,
        role: true,
        totalRoses: true,
        totalPacks: true,
        consecutiveDays: true,
        level: true,
        inviteCode: true,
        registeredAt: true,
        isBanned: true,
        avatar: true,
        nickname: true,
        lastUsernameChange: true,
        lastNicknameChange: true
      }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: '用户不存在' 
      });
    }

    res.json({
      success: true,
      data: {
        userId: user.id,
        username: user.username,
        role: user.role,
        totalRoses: user.totalRoses,
        totalPacks: user.totalPacks,
        consecutiveDays: user.consecutiveDays,
        level: user.level,
        inviteCode: user.inviteCode,
        registeredAt: user.registeredAt,
        isBanned: user.isBanned,
        avatar: user.avatar,
        nickname: user.nickname,
        lastUsernameChange: user.lastUsernameChange,
        lastNicknameChange: user.lastNicknameChange
      }
    });

  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

// GET /api/users/:userId - 获取指定用户信息（公开信息）
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        role: true,
        totalRoses: true,
        level: true,
        registeredAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: '用户不存在' 
      });
    }

    res.json({
      success: true,
      data: {
        userId: user.id,
        username: user.username,
        role: user.role,
        totalRoses: user.totalRoses,
        level: user.level,
        registeredAt: user.registeredAt
      }
    });

  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

// PUT /api/users/me - 更新当前用户信息
router.put('/me', authenticateToken, async (req, res) => {
  try {
    const { avatar, nickname } = req.body;
    const updates = {};

    if (avatar !== undefined) {
      updates.avatar = avatar;
    }

    if (nickname !== undefined) {
      // 检查昵称是否合法
      if (nickname.length > 20) {
        return res.status(400).json({
          success: false,
          error: '昵称长度不能超过20个字符'
        });
      }

      // 检查是否在24小时内修改过昵称
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { lastNicknameChange: true }
      });

      if (user.lastNicknameChange) {
        const now = new Date();
        const lastChange = new Date(user.lastNicknameChange);
        const hoursSinceLastChange = (now - lastChange) / (1000 * 60 * 60);
        
        if (hoursSinceLastChange < 24) {
          const hoursRemaining = Math.ceil(24 - hoursSinceLastChange);
          return res.status(400).json({
            success: false,
            error: `还需等待 ${hoursRemaining} 小时才能修改昵称`
          });
        }
      }

      updates.nickname = nickname || null;
      updates.lastNicknameChange = new Date();
    }

    // 更新用户信息
    const updatedUser = await prisma.user.update({
      where: { id: req.user.userId },
      data: updates,
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true,
        lastNicknameChange: true
      }
    });

    res.json({
      success: true,
      data: {
        userId: updatedUser.id,
        username: updatedUser.username,
        nickname: updatedUser.nickname,
        avatar: updatedUser.avatar,
        lastNicknameChange: updatedUser.lastNicknameChange
      }
    });

  } catch (error) {
    console.error('更新用户信息错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

// PUT /api/users/me/password - 修改密码
router.put('/me/password', authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: '请提供旧密码和新密码'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: '新密码至少6个字符'
      });
    }

    // 获取当前用户
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, passwordHash: true }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: '用户不存在'
      });
    }

    // 验证旧密码
    const isValidPassword = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: '当前密码错误'
      });
    }

    // 加密新密码
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // 更新密码
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash }
    });

    res.json({
      success: true,
      data: { message: '密码修改成功' }
    });

  } catch (error) {
    console.error('修改密码错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

module.exports = router;
