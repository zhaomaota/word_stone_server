const express = require('express');
const prisma = require('../db/prisma');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/packs - 获取所有卡包列表
router.get('/', async (req, res) => {
  try {
    const packs = await prisma.pack.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        cardCount: true,
        weights: true,
        isActive: true
      }
    });

    res.json({
      success: true,
      data: { packs }
    });
  } catch (error) {
    console.error('获取卡包列表错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

// GET /api/users/me/packs - 获取当前用户的卡包库存
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userPacks = await prisma.userPack.findMany({
      where: { userId: req.user.userId },
      include: {
        pack: {
          select: {
            id: true,
            name: true,
            description: true,
            cardCount: true
          }
        }
      }
    });

    // 计算总卡包数
    const totalPacks = userPacks.reduce((sum, up) => sum + up.count, 0);

    res.json({
      success: true,
      data: {
        packs: userPacks.map(up => ({
          packId: up.pack.id,
          name: up.pack.name,
          description: up.pack.description,
          cardCount: up.pack.cardCount,
          count: up.count
        })),
        totalPacks
      }
    });
  } catch (error) {
    console.error('获取用户卡包错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

// POST /api/users/me/packs/add - 添加卡包给用户
router.post('/me/add', authenticateToken, async (req, res) => {
  try {
    const { packId, count = 1 } = req.body;

    if (!packId) {
      return res.status(400).json({ 
        success: false, 
        error: '缺少卡包ID' 
      });
    }

    // 检查卡包是否存在
    const pack = await prisma.pack.findUnique({
      where: { id: packId }
    });

    if (!pack) {
      return res.status(404).json({ 
        success: false, 
        error: '卡包不存在' 
      });
    }

    // 更新或创建用户卡包记录
    const userPack = await prisma.userPack.upsert({
      where: {
        userId_packId: {
          userId: req.user.userId,
          packId: packId
        }
      },
      update: {
        count: {
          increment: count
        }
      },
      create: {
        userId: req.user.userId,
        packId: packId,
        count: count
      }
    });

    // 更新用户总卡包数
    await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        totalPacks: {
          increment: count
        }
      }
    });

    res.json({
      success: true,
      data: {
        packId: userPack.packId,
        count: userPack.count
      }
    });
  } catch (error) {
    console.error('添加卡包错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

// POST /api/users/me/packs/:packId/use - 使用卡包（减少数量）
router.post('/me/:packId/use', authenticateToken, async (req, res) => {
  try {
    const { packId } = req.params;

    // 查找用户的卡包
    const userPack = await prisma.userPack.findUnique({
      where: {
        userId_packId: {
          userId: req.user.userId,
          packId: packId
        }
      }
    });

    if (!userPack || userPack.count <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: '没有可用的卡包' 
      });
    }

    // 减少卡包数量
    const updatedUserPack = await prisma.userPack.update({
      where: {
        userId_packId: {
          userId: req.user.userId,
          packId: packId
        }
      },
      data: {
        count: {
          decrement: 1
        }
      }
    });

    // 更新用户总卡包数
    await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        totalPacks: {
          decrement: 1
        }
      }
    });

    res.json({
      success: true,
      data: {
        packId: updatedUserPack.packId,
        count: updatedUserPack.count
      }
    });
  } catch (error) {
    console.error('使用卡包错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

module.exports = router;
