/**
 * Cloudflare Worker reference for Deska telegram_bridge_url.
 *
 * POST JSON payloads:
 * - Ingest/monitor public channel HTML: { action: "fetch", url: "https://t.me/s/channel" }
 * - Reachability probe: { action: "probe" }
 * - Publish via Bot API: { token, chat_id, caption?, photo_base64?, parse_mode? }
 *
 * Fetch/probe never require bot token or chat_id.
 */
const FETCH_ACTIONS = new Set(['fetch', 'ingest', 'gethtml']);

function normalizeAction(payload) {
  return String(payload?.action || '').trim().toLowerCase();
}

function isAllowedTelegramFetchUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!/^(?:www\.)?t\.me$/iu.test(url.hostname)) return false;
    const parts = url.pathname.split('/').filter(Boolean);
    const username = parts[0] === 's' ? parts[1] : parts[0];
    return Boolean(username && /^[a-z][a-z0-9_]{3,31}$/iu.test(username));
  } catch {
    return false;
  }
}

function telegramHistoryUrl(sourceUrl) {
  const url = new URL(String(sourceUrl).trim());
  const parts = url.pathname.split('/').filter(Boolean);
  const username = (parts[0] === 's' ? parts[1] : parts[0] || '').toLowerCase();
  return `https://t.me/s/${username}`;
}

function isFetchRequest(payload) {
  const action = normalizeAction(payload);
  if (FETCH_ACTIONS.has(action)) return true;
  if (action === 'probe') return false;
  const hasPublishCredentials = Boolean(String(payload?.token || '').trim() || String(payload?.chat_id || payload?.chatId || '').trim());
  return !hasPublishCredentials && isAllowedTelegramFetchUrl(payload?.url);
}

async function handleFetch(payload) {
  const target = String(payload?.url || '');
  if (!isAllowedTelegramFetchUrl(target)) {
    return Response.json({ ok: false, error: 'Invalid telegram channel url' }, { status: 400 });
  }
  const historyUrl = telegramHistoryUrl(target);
  const upstream = await fetch(historyUrl, {
    headers: { 'User-Agent': 'DeskaTelegramBridge/1.0', Accept: 'text/html' },
  });
  if (!upstream.ok) {
    return Response.json({ ok: false, error: `Upstream HTTP ${upstream.status}` }, { status: 502 });
  }
  const html = await upstream.text();
  return Response.json({ ok: true, html });
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function handlePublish(payload) {
  const token = String(payload?.token || '').trim();
  const chatId = String(payload?.chat_id || payload?.chatId || '').trim();
  if (!token || !chatId) {
    return Response.json({ ok: false, error: 'missing token or chat_id' }, { status: 400 });
  }

  const caption = String(payload?.caption || '');
  const parseMode = String(payload?.parse_mode || 'HTML');
  const photoBase64 = String(payload?.photo_base64 || '').trim();
  const endpoint = photoBase64 ? 'sendPhoto' : 'sendMessage';
  const form = new FormData();
  form.set('chat_id', chatId);
  if (caption) form.set('caption', caption);
  if (parseMode) form.set('parse_mode', parseMode);
  if (photoBase64) {
    form.set('photo', new Blob([base64ToBytes(photoBase64)], { type: 'image/jpeg' }), 'photo.jpg');
  } else if (!caption) {
    return Response.json({ ok: false, error: 'caption or photo_base64 is required' }, { status: 400 });
  } else {
    form.set('text', caption);
  }

  const apiUrl = endpoint === 'sendPhoto'
    ? `https://api.telegram.org/bot${token}/sendPhoto`
    : `https://api.telegram.org/bot${token}/sendMessage`;
  const upstream = await fetch(apiUrl, { method: 'POST', body: form });
  const body = await upstream.json().catch(() => ({}));
  if (!upstream.ok || body.ok === false) {
    return Response.json({
      ok: false,
      error: body.description || body.error || `Telegram HTTP ${upstream.status}`,
    }, { status: upstream.ok ? 400 : upstream.status });
  }
  return Response.json({ ok: true, result: body.result || null });
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const action = normalizeAction(payload);
    if (action === 'probe') {
      return Response.json({ ok: true, mode: 'probe' });
    }
    if (isFetchRequest(payload)) {
      return handleFetch(payload);
    }
    return handlePublish(payload);
  },
};
