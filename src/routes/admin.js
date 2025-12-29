const express = require('express');
const prisma = require('../db/prisma');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// PUT /api/admin/users/:userId/role - 修改用户角色（仅超级管理员）
router.put('/users/:userId/role', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['SUPER_ADMIN', 'ADMIN', 'USER'].includes(role)) {
      return res.status(400).json({ 
        success: false, 
        error: '无效的角色类型' 
      });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        username: true,
        role: true
      }
    });

    res.json({
      success: true,
      data: {
        userId: user.id,
        username: user.username,
        role: user.role
      }
    });

  } catch (error) {
    console.error('修改角色错误:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        success: false, 
        error: '用户不存在' 
      });
    }
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

// GET /api/admin/users - 获取用户列表（管理员权限）
router.get('/users', authenticateToken, requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  try {
    const { role, isBanned, search, page = 1, limit = 20 } = req.query;

    const where = {};
    if (role) where.role = role;
    if (isBanned !== undefined) where.isBanned = isBanned === 'true';
    if (search) {
      where.username = {
        contains: search,
        mode: 'insensitive'
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          role: true,
          totalRoses: true,
          isBanned: true,
          registeredAt: true,
          lastLoginAt: true
        },
        skip,
        take,
        orderBy: { registeredAt: 'desc' }
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        users,
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

// POST /api/admin/users/:userId/ban - 封禁用户（管理员权限）
router.post('/users/:userId/ban', authenticateToken, requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, duration } = req.body;

    // 不能封禁自己
    if (userId === req.user.userId) {
      return res.status(400).json({ 
        success: false, 
        error: '不能封禁自己' 
      });
    }

    // 普通管理员不能封禁超级管理员
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (!targetUser) {
      return res.status(404).json({ 
        success: false, 
        error: '用户不存在' 
      });
    }

    if (req.user.role === 'ADMIN' && targetUser.role === 'SUPER_ADMIN') {
      return res.status(403).json({ 
        success: false, 
        error: '管理员不能封禁超级管理员' 
      });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { isBanned: true },
      select: {
        id: true,
        isBanned: true
      }
    });

    res.json({
      success: true,
      data: {
        userId: user.id,
        isBanned: user.isBanned,
        bannedUntil: duration > 0 ? new Date(Date.now() + duration * 1000) : null
      }
    });

  } catch (error) {
    console.error('封禁用户错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

// POST /api/admin/users/:userId/unban - 解封用户（管理员权限）
router.post('/users/:userId/unban', authenticateToken, requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.update({
      where: { id: userId },
      data: { isBanned: false },
      select: {
        id: true,
        isBanned: true
      }
    });

    res.json({
      success: true,
      data: {
        userId: user.id,
        isBanned: user.isBanned
      }
    });

  } catch (error) {
    console.error('解封用户错误:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        success: false, 
        error: '用户不存在' 
      });
    }
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

module.exports = router;
