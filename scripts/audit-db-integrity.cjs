const path = require('node:path');
require('../apps/api/node_modules/dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PrismaClient } = require('../apps/api/node_modules/@prisma/client');

const prisma = new PrismaClient();

const crossTenantChecks = [
  ['NewsArticle.feedId', 'NewsArticle', 'feedId', 'NewsFeed'],
  ['SocialArticle.feedId', 'SocialArticle', 'feedId', 'NewsFeed'],
];

function identifier(value) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) throw new Error('Unsafe database identifier');
  return `"${value}"`;
}

async function count(sql) {
  const rows = await prisma.$queryRawUnsafe(sql);
  return Number(rows[0]?.count || 0);
}

async function main() {
  const issues = [];
  const tables = await prisma.$queryRawUnsafe(
    `SELECT table_name AS "tableName"
       FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'tenantId'
      ORDER BY table_name`,
  );

  for (const row of tables) {
    const table = identifier(String(row.tableName));
    const orphanCount = await count(
      `SELECT COUNT(*)::int AS count
         FROM ${table} AS record
         LEFT JOIN "Tenant" AS tenant ON tenant.id = record."tenantId"
        WHERE record."tenantId" IS NOT NULL AND tenant.id IS NULL`,
    );
    if (orphanCount) issues.push({ check: `${row.tableName}.tenantId`, count: orphanCount });
  }

  for (const [name, childTable, foreignKey, parentTable] of crossTenantChecks) {
    const mismatchCount = await count(
      `SELECT COUNT(*)::int AS count
         FROM ${identifier(childTable)} AS child
         JOIN ${identifier(parentTable)} AS parent ON parent.id = child.${identifier(foreignKey)}
        WHERE child.${identifier(foreignKey)} IS NOT NULL
          AND child."tenantId" <> parent."tenantId"`,
    );
    if (mismatchCount) issues.push({ check: name, count: mismatchCount });
  }

  const ownerIssues = await count(
    `SELECT COUNT(*)::int AS count
       FROM "Tenant" AS tenant
       LEFT JOIN "TenantMember" AS member
         ON member."tenantId" = tenant.id
        AND member."userId" = tenant."primaryOwnerUserId"
      WHERE tenant.status = 'active'
        AND (tenant."primaryOwnerUserId" IS NULL OR member."userId" IS NULL OR member.status <> 'active' OR member.role <> 'owner')`,
  );
  if (ownerIssues) issues.push({ check: 'Tenant.primaryOwnerMembership', count: ownerIssues });

  if (issues.length) {
    console.error('Database integrity issues found:');
    for (const issue of issues) console.error(`  - ${issue.check}: ${issue.count}`);
    process.exitCode = 1;
    return;
  }

  console.log('Database integrity checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
