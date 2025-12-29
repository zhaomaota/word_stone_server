const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  console.log('开始数据库初始化...');

  // 创建默认卡包
  const defaultPack = await prisma.pack.upsert({
    where: { id: 'default-pack-001' },
    update: {},
    create: {
      id: 'default-pack-001',
      name: '基础卡包',
      description: '包含常见的英语单词',
      cardCount: 5,
      weights: {
        common: 70,
        rare: 20,
        epic: 8,
        legendary: 2
      },
      isActive: true
    }
  });

  console.log('✅ 默认卡包已创建:', defaultPack.name);

  // 可以在这里添加更多初始数据
  // 例如：示例单词、成就等

  console.log('✅ 数据库初始化完成！');
}

seed()
  .catch((e) => {
    console.error('❌ 数据库初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
