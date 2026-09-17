const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.systemCalendarObservance.findMany({ orderBy: { startAt: 'asc' } });
  const json = JSON.stringify(rows, null, 2);
  if (process.argv.includes('--base64')) {
    process.stdout.write(Buffer.from(json, 'utf8').toString('base64'));
  } else {
    process.stdout.write(json);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
