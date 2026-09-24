export interface Env {
  BRIDGE_SECRET?: string;
}

/** Telegram channel pages can be huge; keep the tail (recent posts) and cap JSON payload size. */
const MAX_UPSTREAM_BODY_CHARS = 2_500_000;

const SOCIAL_HOSTS = [
  't.me',
  'telegram.me',
  'x.com',
  'twitter.com',
  'mobile.twitter.com',
  'syndication.twitter.com',
  'cdn.syndication.twimg.com',
];

export function isSocialFetchHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/u, '');
  return SOCIAL_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/** Public news/RSS hosts (e.g. euronews.com) — blocked only for private/metadata IPs. */
export function isPublicFetchHostAllowed(hostname: string): boolean {
  return isSocialFetchHost(hostname) || !isBlockedFetchHost(hostname);
}

export function isBlockedFetchHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/u, '').replace(/^\[|\]$/gu, '');
  if (!host) return true;
  if (
    host === 'localhost'
    || host === 'metadata.google.internal'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
    || host.endsWith('.lan')
    || host.endsWith('.home')
  ) {
    return true;
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host)) {
    const parts = host.split('.').map((part) => Number(part));
    if (parts.some((part) => Number.isNaN(part) || part > 255)) return true;
    const [a, b] = parts;
    return a === 0
      || a === 10
      || a === 127
      || a >= 224
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127);
  }

  if (host.includes(':')) {
    const normalized = host.replace(/^::ffff:/iu, '');
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(normalized)) return isBlockedFetchHost(normalized);
    return host === '::1'
      || host === '::'
      || host.startsWith('fc')
      || host.startsWith('fd')
      || host.startsWith('fe80')
      || host.startsWith('ff');
  }

  return false;
}

function hostAllowed(hostname: string): boolean {
  return isPublicFetchHostAllowed(hostname);
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization, x-bridge-secret',
    },
  });
}

function extractXHandle(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (!/(?:^|\.)(?:x|twitter)\.com$/u.test(host)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (!parts.length) return null;
  const handle = parts[0];
  if (!/^[A-Za-z0-9_]{1,15}$/u.test(handle)) return null;
  if (['home', 'explore', 'search', 'i', 'settings', 'intent', 'share', 'compose'].includes(handle.toLowerCase())) {
    return null;
  }
  return handle;
}

function unescapeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value
      .replace(/\\n/gu, '\n')
      .replace(/\\"/gu, '"')
      .replace(/\\\//gu, '/')
      .replace(/\\\\/gu, '\\');
  }
}

type Normalized = { url: URL; xHandle: string | null };

function normalizeTargetUrl(raw: string): Normalized {
  const url = new URL(String(raw || '').trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('invalid_url');
  }
  if (!hostAllowed(url.hostname)) throw new Error('host_not_allowed');

  if (/(?:^|\.)t\.me$/iu.test(url.hostname) || /(?:^|\.)telegram\.me$/iu.test(url.hostname)) {
    const parts = url.pathname.split('/').filter(Boolean);
    const username = parts[0] === 's' ? parts[1] : parts[0];
    if (!username || !/^[a-z][a-z0-9_]{3,31}$/iu.test(username)) {
      throw new Error('invalid_telegram_channel');
    }
    return { url: new URL(`https://t.me/s/${username.toLowerCase()}`), xHandle: null };
  }

  if (/(?:^|\.)syndication\.twitter\.com$/iu.test(url.hostname)) {
    const m = url.pathname.match(/screen-name\/([^/]+)/iu);
    return { url, xHandle: m?.[1] ? decodeURIComponent(m[1]) : null };
  }

  const handle = extractXHandle(url);
  if (handle && url.pathname.split('/').filter(Boolean).length === 1) {
    return {
      url: new URL(
        `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(handle)}`,
      ),
      xHandle: handle,
    };
  }

  return { url, xHandle: handle };
}

type TweetCard = { id: string; text: string; url: string };

function extractTweetsFromSyndicationHtml(html: string, fallbackHandle?: string | null): TweetCard[] {
  const tweets: TweetCard[] = [];
  const seen = new Set<string>();
  const handle = fallbackHandle || 'i';

  // Walk every id_str and look nearby for full_text / permalink.
  const idRe = /"id_str":"(\d{5,})"/gu;
  let idMatch: RegExpExecArray | null;
  while ((idMatch = idRe.exec(html)) && tweets.length < 40) {
    const id = idMatch[1];
    if (seen.has(id)) continue;
    const start = Math.max(0, idMatch.index - 500);
    const end = Math.min(html.length, idMatch.index + 2500);
    const window = html.slice(start, end);

    const textMatch = window.match(/"full_text":"((?:\\.|[^"\\])*)"/u);
    if (!textMatch) continue;
    const text = unescapeJsonString(textMatch[1]).trim();
    if (!text) continue;

    const permalinkMatch = window.match(/"permalink":"((?:\\.|[^"\\])*)"/u);
    let tweetUrl = '';
    if (permalinkMatch) {
      const permalink = unescapeJsonString(permalinkMatch[1]);
      tweetUrl = permalink.startsWith('http')
        ? permalink
        : `https://x.com${permalink.startsWith('/') ? '' : '/'}${permalink}`;
    } else {
      tweetUrl = `https://x.com/${handle}/status/${id}`;
    }

    seen.add(id);
    tweets.push({ id, text, url: tweetUrl });
  }

  return tweets;
}

function trimBodyForBridge(body: string, isTelegram: boolean): string {
  if (body.length <= MAX_UPSTREAM_BODY_CHARS) return body;
  // t.me/s lists older posts first; recent messages live near the end of the HTML.
  return isTelegram ? body.slice(-MAX_UPSTREAM_BODY_CHARS) : body.slice(0, MAX_UPSTREAM_BODY_CHARS);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function renderTweetsAsLegacyHtml(tweets: TweetCard[]): string {
  const items = tweets
    .map(
      (tweet) => `<article class="timeline-Tweet" data-tweet-id="${escapeHtml(tweet.id)}">
  <p class="timeline-Tweet-text">${escapeHtml(tweet.text)}</p>
  <a class="timeline-Tweet-timestamp" href="${escapeHtml(tweet.url)}">${escapeHtml(tweet.url)}</a>
</article>`,
    )
    .join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Deska X bridge</title></head><body>
${items}
</body></html>`;
}

const MAX_REDIRECTS = 5;

/** Every redirect hop must pass the same host check as the original URL. */
export async function fetchFollowingSafeRedirects(
  url: URL,
  headers: Record<string, string>,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetcher(current.toString(), { method: 'GET', headers, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location || hop === MAX_REDIRECTS) throw new Error('too_many_redirects');
    const next = new URL(location, current);
    if (!['http:', 'https:'].includes(next.protocol) || next.username || next.password || !hostAllowed(next.hostname)) {
      throw new Error('redirect_host_not_allowed');
    }
    current = next;
  }
  throw new Error('too_many_redirects');
}

async function fetchUpstream(url: URL, accept: string, userAgent: string, referer?: string): Promise<Response> {
  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    Accept: accept,
    'Accept-Language': 'en-US,en;q=0.9,fa;q=0.8',
    'Cache-Control': 'no-cache',
    Referer: referer || `${url.origin}/`,
  };

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const upstream = await fetchFollowingSafeRedirects(url, headers);
      if (upstream.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      return upstream;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('upstream_fetch_failed');
}

function xTimelineCandidates(handle: string, primary: URL): URL[] {
  const encoded = encodeURIComponent(handle);
  const candidates = [
    primary,
    new URL(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${encoded}`),
    new URL(`https://cdn.syndication.twimg.com/timeline/profile?screen_name=${encoded}`),
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchXTimelineUpstream(
  handle: string,
  primary: URL,
  accept: string,
  userAgent: string,
): Promise<{ upstream: Response; body: string; finalUrl: URL }> {
  const candidates = xTimelineCandidates(handle, primary);
  let lastResponse: Response | null = null;
  let lastBody = '';

  for (const candidate of candidates) {
    const upstream = await fetchUpstream(candidate, accept, userAgent, 'https://x.com/');
    const body = await upstream.text();
    lastResponse = upstream;
    lastBody = body;
    if (upstream.ok) {
      return { upstream, body, finalUrl: candidate };
    }
    if (upstream.status !== 429 && upstream.status !== 502 && upstream.status !== 503) {
      break;
    }
  }

  if (!lastResponse) throw new Error('upstream_fetch_failed');
  return { upstream: lastResponse, body: lastBody, finalUrl: candidates[candidates.length - 1] };
}

type TelegramApiBody = { ok?: boolean; description?: string; error_code?: number };

async function readTelegramApiBody(response: Response): Promise<TelegramApiBody> {
  try {
    return (await response.json()) as TelegramApiBody;
  } catch {
    return {};
  }
}

async function telegramBotFetch(token: string, method: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, init);
}

function decodeBase64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s+/gu, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function handleTelegramRelay(payload: Record<string, unknown>): Promise<Response | null> {
  const token = String(payload.token || '').trim();
  if (!token) return null;

  const chatId = String(payload.chat_id || '').trim();
  const photoBase64 = String(payload.photo_base64 || '').trim();
  const caption = String(payload.caption || '').trim();
  const action = String(payload.action || '').trim().toLowerCase();
  const wantsTest = action === 'telegram_test' || (!photoBase64 && !caption && Boolean(chatId));

  if (wantsTest) {
    if (!chatId) return json(400, { ok: false, error: 'missing_chat_id' });
    const meResponse = await telegramBotFetch(token, 'getMe');
    const meBody = await readTelegramApiBody(meResponse);
    if (!meResponse.ok || !meBody.ok) {
      return json(502, {
        ok: false,
        error: 'telegram_get_me_failed',
        description: meBody.description || `HTTP ${meResponse.status}`,
      });
    }
    const chatResponse = await telegramBotFetch(token, `getChat?chat_id=${encodeURIComponent(chatId)}`);
    const chatBody = await readTelegramApiBody(chatResponse);
    if (!chatResponse.ok || !chatBody.ok) {
      return json(502, {
        ok: false,
        error: 'telegram_get_chat_failed',
        description: chatBody.description || `HTTP ${chatResponse.status}`,
      });
    }
    return json(200, { ok: true, mode: 'telegram_test', worker: 'deska' });
  }

  if (photoBase64 || caption) {
    if (!chatId) return json(400, { ok: false, error: 'missing_chat_id' });
    const form = new FormData();
    form.set('chat_id', chatId);
    if (caption) form.set('caption', caption.slice(0, 1024));
    if (payload.parse_mode) form.set('parse_mode', String(payload.parse_mode));
    if (photoBase64) {
      const bytes = decodeBase64ToBytes(photoBase64);
      form.set('photo', new Blob([bytes], { type: 'image/jpeg' }), 'social.jpg');
    }
    const sendResponse = await telegramBotFetch(token, 'sendPhoto', { method: 'POST', body: form });
    const sendBody = await readTelegramApiBody(sendResponse);
    if (!sendResponse.ok || !sendBody.ok) {
      return json(502, {
        ok: false,
        error: 'telegram_send_photo_failed',
        description: sendBody.description || `HTTP ${sendResponse.status}`,
      });
    }
    return json(200, { ok: true, mode: 'telegram_send_photo', worker: 'deska' });
  }

  return json(400, { ok: false, error: 'invalid_telegram_payload' });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization, x-bridge-secret',
        },
      });
    }

    if (request.method !== 'POST') {
      return json(405, { ok: false, error: 'method_not_allowed' });
    }

    if (env.BRIDGE_SECRET) {
      const provided = request.headers.get('x-bridge-secret') || request.headers.get('authorization') || '';
      const normalized = provided.startsWith('Bearer ') ? provided.slice(7).trim() : provided.trim();
      if (normalized !== env.BRIDGE_SECRET) {
        return json(401, { ok: false, error: 'unauthorized' });
      }
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return json(400, { ok: false, error: 'invalid_json' });
    }

    if (String(payload.action || '').trim().toLowerCase() === 'probe') {
      return json(200, { ok: true, mode: 'probe', worker: 'deska' });
    }

    const telegramResponse = await handleTelegramRelay(payload);
    if (telegramResponse) return telegramResponse;

    const targetRaw = String(payload.url || '').trim();
    if (!targetRaw) return json(400, { ok: false, error: 'missing_url' });

    let normalized: Normalized;
    try {
      normalized = normalizeTargetUrl(targetRaw);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'invalid_url';
      return json(code === 'host_not_allowed' ? 403 : 400, { ok: false, error: code });
    }

    const accept = String(payload.accept || 'text/html,application/xhtml+xml,application/json,*/*;q=0.1');
    const userAgent = String(
      payload.user_agent ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    );

    let upstream: Response;
    let body = '';
    let finalUrl = normalized.url;
    try {
      if (normalized.xHandle && /syndication\.twitter\.com/iu.test(normalized.url.hostname)) {
        const xResult = await fetchXTimelineUpstream(normalized.xHandle, normalized.url, accept, userAgent);
        upstream = xResult.upstream;
        body = xResult.body;
        finalUrl = xResult.finalUrl;
      } else {
        upstream = await fetchUpstream(normalized.url, accept, userAgent);
        const upstreamContentType = upstream.headers.get('content-type') || 'text/plain';
        const imageType = upstreamContentType.toLowerCase().split(';')[0].trim();
        if (imageType.startsWith('image/')) {
          const bytes = new Uint8Array(await upstream.arrayBuffer());
          if (bytes.length > 8_000_000) {
            return json(413, { ok: false, error: 'image_too_large' });
          }
          let binary = '';
          for (let index = 0; index < bytes.length; index += 1) {
            binary += String.fromCharCode(bytes[index]!);
          }
          if (!upstream.ok) {
            return json(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502, {
              ok: false,
              error: `upstream_http_${upstream.status}`,
              status: upstream.status,
              content_type: upstreamContentType,
            });
          }
          return json(200, {
            ok: true,
            status: upstream.status,
            content_type: upstreamContentType,
            body_base64: btoa(binary),
            final_url: normalized.url.toString(),
            worker: 'deska',
          });
        }
        body = await upstream.text();
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return json(502, { ok: false, error: 'upstream_fetch_failed', detail });
    }

    const upstreamContentType = upstream.headers.get('content-type') || 'text/plain';

    if (!upstream.ok) {
      return json(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502, {
        ok: false,
        error: `upstream_http_${upstream.status}`,
        status: upstream.status,
        content_type: upstreamContentType,
        body: body.slice(0, 8000),
      });
    }

    const isTelegram = /(?:^|\.)t\.me$/iu.test(finalUrl.hostname);
    const isX =
      /syndication\.twitter\.com/iu.test(finalUrl.hostname) ||
      /cdn\.syndication\.twimg\.com/iu.test(finalUrl.hostname) ||
      /(?:^|\.)(?:x|twitter)\.com$/iu.test(new URL(targetRaw).hostname);

    let tweetCount = 0;
    let contentType = upstreamContentType;
    if (isX) {
      const tweets = extractTweetsFromSyndicationHtml(body, normalized.xHandle);
      tweetCount = tweets.length;
      if (tweets.length) {
        body = renderTweetsAsLegacyHtml(tweets);
        contentType = 'text/html; charset=utf-8';
      }
    } else {
      body = trimBodyForBridge(body, isTelegram);
    }

    return json(200, {
      ok: true,
      status: upstream.status,
      content_type: contentType,
      body,
      final_url: finalUrl.toString(),
      worker: 'deska',
      x_tweets: isX ? tweetCount : undefined,
    });
  },
};
