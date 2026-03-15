try {
  const { PrismaClient } = require('.prisma/client');
  console.log('PrismaClient import OK');
  const p = new PrismaClient();
  console.log('PrismaClient instantiation OK');
  p.$disconnect();
} catch(e) {
  console.error('ERROR:', e.message);
}
