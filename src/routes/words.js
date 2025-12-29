const express = require('express');
const prisma = require('../db/prisma');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/words - 获取单词列表（支持筛选）
router.get('/', async (req, res) => {
  try {
    const { rarity, search, page = 1, limit = 20 } = req.query;

    const where = {};
    if (rarity) where.rarity = rarity.toUpperCase();
    if (search) {
      where.OR = [
        { word: { contains: search, mode: 'insensitive' } },
        { definition: { contains: search, mode: 'insensitive' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [words, total] = await Promise.all([
      prisma.word.findMany({
        where,
        select: {
          id: true,
          word: true,
          definition: true,
          rarity: true,
          pronunciation: true,
          partOfSpeech: true,
          variants: true
        },
        skip,
        take,
        orderBy: { word: 'asc' }
      }),
      prisma.word.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        words,
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取单词列表错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

// GET /api/users/me/words - 获取当前用户的单词库存
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { isFavorited, rarity, sortBy = 'obtainedAt', page = 1, limit = 100 } = req.query;

    const where = { userId: req.user.userId };
    if (isFavorited !== undefined) where.isFavorited = isFavorited === 'true';

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const userWords = await prisma.userWord.findMany({
      where,
      include: {
        word: true
      },
      skip,
      take,
      orderBy: { obtainedAt: 'desc' }
    });

    // 如果指定了稀有度筛选，在内存中过滤
    let filteredWords = userWords;
    if (rarity) {
      filteredWords = userWords.filter(uw => uw.word.rarity === rarity.toUpperCase());
    }

    const total = filteredWords.length;

    res.json({
      success: true,
      data: {
        words: filteredWords.map(uw => ({
          wordId: uw.word.id,
          word: uw.word.word,
          definition: uw.word.definition,
          rarity: uw.word.rarity,
          pronunciation: uw.word.pronunciation,
          partOfSpeech: uw.word.partOfSpeech,
          isFavorited: uw.isFavorited,
          obtainedAt: uw.obtainedAt
        })),
        total
      }
    });
  } catch (error) {
    console.error('获取用户单词错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

// POST /api/users/me/words - 批量添加单词到用户库存
router.post('/me', authenticateToken, async (req, res) => {
  try {
    const { words } = req.body; // [{word, definition, rarity, partOfSpeech}]

    if (!Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: '单词数据格式错误' 
      });
    }

    const results = [];

    for (const wordData of words) {
      // 先查找或创建单词
      let word = await prisma.word.findUnique({
        where: { word: wordData.word }
      });

      if (!word) {
        // 如果单词不存在，创建它
        word = await prisma.word.create({
          data: {
            word: wordData.word,
            definition: wordData.definition || wordData.trans || '',
            rarity: wordData.rarity ? wordData.rarity.toUpperCase() : 'COMMON',
            partOfSpeech: wordData.partOfSpeech || 'OTHER',
            variants: []
          }
        });
      }

      // 检查用户是否已拥有该单词
      const existingUserWord = await prisma.userWord.findUnique({
        where: {
          userId_wordId: {
            userId: req.user.userId,
            wordId: word.id
          }
        }
      });

      if (!existingUserWord) {
        // 添加到用户库存
        await prisma.userWord.create({
          data: {
            userId: req.user.userId,
            wordId: word.id,
            isFavorited: false
          }
        });
        results.push({ word: word.word, added: true });
      } else {
        results.push({ word: word.word, added: false, reason: 'already_owned' });
      }
    }

    res.json({
      success: true,
      data: {
        results,
        addedCount: results.filter(r => r.added).length
      }
    });
  } catch (error) {
    console.error('添加单词错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

// POST /api/users/me/words/:wordId/favorite - 收藏/取消收藏单词
router.post('/me/:wordId/favorite', authenticateToken, async (req, res) => {
  try {
    const { wordId } = req.params;
    const { isFavorited } = req.body;

    const userWord = await prisma.userWord.update({
      where: {
        userId_wordId: {
          userId: req.user.userId,
          wordId: wordId
        }
      },
      data: { isFavorited },
      select: {
        isFavorited: true,
        word: {
          select: {
            id: true,
            word: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: {
        wordId: userWord.word.id,
        word: userWord.word.word,
        isFavorited: userWord.isFavorited
      }
    });
  } catch (error) {
    console.error('更新收藏状态错误:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        success: false, 
        error: '单词不存在或用户未拥有该单词' 
      });
    }
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

module.exports = router;
