import fs from 'node:fs/promises';
import path from 'node:path';

const catalogPath = process.argv[2] || 'landing/assets/source-catalog.json';
const outputDir = process.argv[3] || 'landing/assets/source-logos';
const refreshAll = process.argv.includes('--all');
const refreshCurated = process.argv.includes('--curated');
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
await fs.mkdir(outputDir, { recursive: true });

// Feed and API hosts often do not expose the publication's favicon. Always try
// the actual publication domain as well.
const domainAliases = {
  'api.axios.com': 'axios.com',
  'en.vietnamplus.vn': 'vietnamplus.vn',
  'feeds.bbci.co.uk': 'bbc.com',
  'feeds.elpais.com': 'elpais.com',
  'feeds.nbcnews.com': 'nbcnews.com',
  'feeds.npr.org': 'npr.org',
  'irica.gov.ir': 'irica.ir',
  'moxie.foxnews.com': 'foxnews.com',
  'rss.sueddeutsche.de': 'sueddeutsche.de',
};

// Curated raster sources for organizations whose sites either block automated
// requests or return a generic initial instead of their real identity.
const officialLogoUrls = {
  'afp-com': [
    'https://commons.wikimedia.org/wiki/Special:Redirect/file/Agence_France-Presse_Logo.svg?width=512',
  ],
  'aja-ir': [
    'https://commons.wikimedia.org/wiki/Special:Redirect/file/Seal_of_the_Islamic_Republic_of_Iran_Army.svg?width=512',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Seal_of_the_Islamic_Republic_of_Iran_Army.svg/960px-Seal_of_the_Islamic_Republic_of_Iran_Army.svg.png',
  ],
  'behdasht-gov-ir': [
    'https://www.unicef.org/iran/sites/unicef.org.iran/files/styles/crop_thumbnail/public/%D9%88%D8%B2%D8%A7%D8%B1%D8%AA%20%D8%A8%D9%87%D8%AF%D8%A7%D8%B4%D8%AA.jpg.webp?itok=CDDCCz2c',
  ],
  'centinsur-ir': [
    'https://commons.wikimedia.org/wiki/Special:Redirect/file/Centinsur_Logo.jpg',
  ],
  'chtn-ir': [
    'https://upload.wikimedia.org/wikipedia/commons/c/c6/%D9%84%D9%88%DA%AF%D9%88%DB%8C_%D8%AE%D8%A8%D8%B1%DA%AF%D8%B2%D8%A7%D8%B1%DB%8C_%D9%85%DB%8C%D8%B1%D8%A7%D8%AB%E2%80%8C%D8%A2%D8%B1%DB%8C%D8%A7.jpg',
    'https://cdn4.telesco.pe/file/hrmzqOEIDHzCD7Y9wxKdNdNEMVYwHj70iUxCKs9w0wrRJlSCGj21lHICuAaiM6EkvQmwsEGKeIH7Oo2pOYS8-fAR1AQcGPpwoeuexkm72YTXRg0uGEnvqA3FOkTL3_-ZO6nvrT4z2gDYNsATNSo_SsuVPnCR5lR6wQgG5HHOABtZ5c0xeG251m_V9OROD6RwfyLhyab7IOxhup0RYYbMHVz_iv3aAILdR-1QT3XWKK_gbgnoF0tcTzp5YhuG6_XXe3lSw2W8U2cdlR6u0Ix7eMe2tSGWmLsEY47swSiB1ahONXGzQOf52G2u8zlDXYmHoHumsOQ83UwNgsvsjtfwGw.jpg',
    'https://t.me/i/userpic/320/CHTNIran.jpg',
  ],
  'etemadnewspaper-ir': [
    'https://etemadonline.com/favicon.ico',
    'https://www.google.com/s2/favicons?domain=etemadnewspaper.ir&sz=256',
    'https://old.iranintl.com/sites/default/files/styles/articles_landing/public/2244107_1.jpg?itok=vH5HPVLE',
    'https://pbs.twimg.com/profile_images/1290244319316770817/COcFDRSS_400x400.jpg',
  ],
  'irica-gov-ir': [
    'https://40soton.com/wp-content/uploads/2023/04/619-1-5-500.png',
  ],
  'jomhourieslami-com': [
    'https://commons.wikimedia.org/wiki/Special:Redirect/file/Jomhouri_Eslami_logo_(bloody_version).svg?width=512',
  ],
  'moi-ir': [
    'https://www.unicef.org/iran/sites/unicef.org.iran/files/styles/crop_thumbnail/public/moi_0.png.webp?itok=vrkOEuHU',
  ],
  'mop-ir': [
    'https://commons.wikimedia.org/wiki/Special:Redirect/file/Flag_of_the_Ministry_of_Petroleum_(Iran).svg?width=512',
    'https://pbs.twimg.com/profile_images/414703125748916224/EG6aDlQ6_400x400.png',
  ],
  'nioc-ir': [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/National_Iranian_Oil_Company_logo.svg/960px-National_Iranian_Oil_Company_logo.svg.png',
  ],
  'rai-ir': [
    'https://uic.org/com/IMG/arton7614.jpg',
  ],
  'sana-sy': [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Logo_of_the_Syrian_Arab_News_Agency_%28positive%29.svg/960px-Logo_of_the_Syrian_Arab_News_Agency_%28positive%29.svg.png',
    'https://commons.wikimedia.org/wiki/Special:Redirect/file/Logo_Syrian_Arab_News_Agency_(SANA)_2024.png',
  ],
  'seo-ir': [
    'https://media.licdn.com/dms/image/v2/D560BAQFq36uZNuEU4w/company-logo_400_400/company-logo_400_400/0/1709540421942?e=2147483647&t=O0hBkHM6Q9AiUd7i5I4RvtVDwGyo9vAh2loreelhKkk&v=beta',
  ],
};

const queue = [...catalog];
let completed = 0;
let downloaded = 0;
let preserved = 0;
const unresolved = [];

function isImage(bytes) {
  if (!bytes || bytes.length < 40) return false;
  const head = bytes.subarray(0, 16);
  return (
    head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) ||
    head.subarray(0, 6).toString('ascii') === 'GIF87a' ||
    head.subarray(0, 6).toString('ascii') === 'GIF89a' ||
    (head[0] === 0x00 && head[1] === 0x00 && head[2] === 0x01 && head[3] === 0x00) ||
    (head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP')
  );
}

async function hasValidFile(filePath) {
  try {
    return isImage(await fs.readFile(filePath));
  } catch {
    return false;
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function candidateDomains(source) {
  const domain = String(source.domain || '').toLowerCase().replace(/^www\./, '');
  const alias = domainAliases[domain];
  return unique([alias, domain]);
}

async function fetchBytes(url, accept = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8') {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    headers: {
      accept,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141 Safari/537.36',
    },
  });
  if (!response.ok) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  return isImage(bytes) ? bytes : null;
}

async function discoverSiteIcons(domain) {
  const urls = [];
  for (const protocol of ['https', 'http']) {
    try {
      const response = await fetch(`${protocol}://${domain}/`, {
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141 Safari/537.36',
        },
      });
      if (!response.ok) continue;
      const html = await response.text();
      const base = response.url;
      const linkPattern = /<link\b[^>]*>/gi;
      for (const tag of html.match(linkPattern) || []) {
        if (!/\brel\s*=\s*["'][^"']*(?:icon|apple-touch-icon)[^"']*["']/i.test(tag)) continue;
        const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
        if (!href || href.startsWith('data:')) continue;
        try {
          urls.push(new URL(href, base).href);
        } catch {
          // Ignore malformed icon URLs from third-party page markup.
        }
      }
      break;
    } catch {
      // Try the next protocol and then the favicon services.
    }
  }
  return unique(urls);
}

async function fetchLogo(source) {
  const outputPath = path.join(outputDir, `${source.slug}.png`);
  const shouldRefreshCurated = refreshCurated && officialLogoUrls[source.slug];
  if (!refreshAll && !shouldRefreshCurated && await hasValidFile(outputPath)) {
    preserved += 1;
    return;
  }

  const domains = candidateDomains(source);
  const discovered = [];
  for (const domain of domains) discovered.push(...await discoverSiteIcons(domain));

  const curatedCandidates = officialLogoUrls[source.slug] || [];
  const directCandidates = domains.flatMap((domain) => [
    `https://${domain}/favicon.ico`,
    `https://www.${domain}/favicon.ico`,
  ]);
  const candidates = curatedCandidates.length
    ? unique([...curatedCandidates, ...discovered, ...directCandidates])
    : unique([
      ...discovered,
      ...directCandidates,
      ...domains.flatMap((domain) => [
        `https://icons.duckduckgo.com/ip3/${domain}.ico`,
        `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${domain}`)}&sz=256`,
        `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`,
        `https://favicon.im/${domain}?larger=true`,
        `https://icon.horse/icon/${domain}`,
        `https://unavatar.io/${domain}?fallback=false`,
      ]),
      source.logoUrl,
    ]);

  for (const url of candidates) {
    try {
      const bytes = await fetchBytes(url);
      if (!bytes) continue;
      await fs.writeFile(outputPath, bytes);
      downloaded += 1;
      return;
    } catch {
      // Continue through the candidate list; failures are reported at the end.
    }
  }

  unresolved.push({ slug: source.slug, name: source.name, domains });
}

async function worker() {
  while (queue.length) {
    const source = queue.pop();
    if (!source) return;
    await fetchLogo(source);
    completed += 1;
    if (completed % 25 === 0 || completed === catalog.length) {
      console.log(`${completed}/${catalog.length} logos checked`);
    }
  }
}

await Promise.all(Array.from({ length: 10 }, worker));
console.log(JSON.stringify({
  sources: catalog.length,
  downloaded,
  preserved,
  unresolved,
  outputDir,
}, null, 2));
if (unresolved.length) process.exitCode = 1;
