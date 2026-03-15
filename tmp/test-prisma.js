require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Fetching coin configs...');
    const configs = await prisma.coinConfig.findMany();
    console.log('Configs:', configs);
  } catch (err) {
    console.error('Error fetching configs:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
