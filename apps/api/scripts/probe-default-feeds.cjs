const path = require('node:path');
const { isIP } = require('node:net');
const { lookup } = require('node:dns/promises');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
const { DEFAULT_PLATFORM_FEEDS, FEED_CATALOG_GROUP_ORDER } = require('@deska/shared');
const { SourceReaderService } = require('../dist/modules/smart-publishing/source-reader.service');

function isBlockedAddress(address) {
  if (isIP(address) === 4) {
    const parts = address.split('.').map((part) => Number.parseInt(part, 10));
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
  }
  return false;
}

async function isDnsFiltered(url) {
  try {
    const hostname = new URL(url).hostname;
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses.some((item) => isBlockedAddress(item.address));
  } catch {
    return false;
  }
}

async function main() {
  const reader = new SourceReaderService();
  const summary = Object.fromEntries(
    FEED_CATALOG_GROUP_ORDER.map((group) => [group, { ok: 0, fail: 0, skip: 0 }]),
  );

  for (const feed of DEFAULT_PLATFORM_FEEDS) {
    const group = feed.catalogGroup;
    if (await isDnsFiltered(feed.url)) {
      summary[group].skip += 1;
      console.log(`SKIP ${group} ${feed.name} — DNS فیلتر شده (t.me/x.com در این شبکه قابل تست نیست)`);
      continue;
    }
    try {
      const entries = await reader.readSource(feed.sourceType, feed.url);
      summary[group].ok += 1;
      console.log(`OK   ${group} ${feed.name} (${entries.length} items)`);
    } catch (error) {
      summary[group].fail += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`FAIL ${group} ${feed.name}: ${message}`);
    }
  }

  console.log('\n--- Summary ---');
  for (const group of FEED_CATALOG_GROUP_ORDER) {
    const stats = summary[group];
    console.log(`${group}: ${stats.ok} ok, ${stats.fail} fail, ${stats.skip} skipped`);
  }

  const domesticFailed = summary['media-domestic'].fail > 0;
  const internationalFailed = summary['media-international'].fail > 0;
  process.exitCode = domesticFailed || internationalFailed ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
