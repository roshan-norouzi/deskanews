/**
 * Cloudflare Worker reference for Deska telegram_bridge_url.
 *
 * Supported POST JSON payloads:
 * - Publish (existing): { token, chat_id, caption?, photo_base64?, parse_mode? }
 * - Fetch public t.me page (ingest): { action: "fetch", url: "https://t.me/s/channel" }
 *
 * The fetch action only allows t.me public channel/history URLs.
 */
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

    if (payload?.action === 'fetch') {
      const target = String(payload.url || '');
      let parsed;
      try {
        parsed = new URL(target);
      } catch {
        return Response.json({ ok: false, error: 'Invalid fetch url' }, { status: 400 });
      }
      if (!/^(?:www\.)?t\.me$/i.test(parsed.hostname)) {
        return Response.json({ ok: false, error: 'Only t.me URLs are allowed' }, { status: 400 });
      }
      const parts = parsed.pathname.split('/').filter(Boolean);
      const username = parts[0] === 's' ? parts[1] : parts[0];
      if (!username || !/^[a-z][a-z0-9_]{3,31}$/i.test(username)) {
        return Response.json({ ok: false, error: 'Invalid telegram channel url' }, { status: 400 });
      }
      const historyUrl = `https://t.me/s/${username.toLowerCase()}`;
      const upstream = await fetch(historyUrl, {
        headers: { 'User-Agent': 'DeskaTelegramBridge/1.0', Accept: 'text/html' },
      });
      if (!upstream.ok) {
        return Response.json({ ok: false, error: `Upstream HTTP ${upstream.status}` }, { status: 502 });
      }
      const html = await upstream.text();
      return Response.json({ ok: true, html });
    }

    const token = String(payload?.token || '');
    const chatId = String(payload?.chat_id || payload?.chatId || '');
    if (!token || !chatId) {
      return Response.json({ ok: false, error: 'token and chat_id are required' }, { status: 400 });
    }

    // Existing publish flow continues to proxy Bot API sendPhoto/sendMessage.
    return Response.json({ ok: false, error: 'Publish payload handling belongs to the deployed worker version' }, { status: 400 });
  },
};
