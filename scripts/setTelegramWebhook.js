#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// One-time setup for DG OS Chat (Telegram): tells Telegram where to send
// incoming messages ("Gomez, wie sieht der Markt aus?") — i.e. the Always-On
// Server's /api/telegram/webhook endpoint. Run this ONCE after the server
// is deployed and TELEGRAM_BOT_TOKEN is configured on Railway (only needs
// re-running if the server's public URL ever changes).
//
// Usage:
//   TELEGRAM_BOT_TOKEN=... node scripts/setTelegramWebhook.js https://<your-railway-url>
//
// Optional: pass a second argument to also set a webhook secret token
// (Telegram will echo it back in the X-Telegram-Bot-Api-Secret-Token
// header on every call, which server/api.js verifies if TELEGRAM_WEBHOOK_
// SECRET is configured — see server/index.js):
//   TELEGRAM_BOT_TOKEN=... node scripts/setTelegramWebhook.js https://<url> <secret>
// ---------------------------------------------------------------------------

const https = require('https');

const token = process.env.TELEGRAM_BOT_TOKEN;
const serverUrl = process.argv[2];
const secretToken = process.argv[3];

if (!token) {
  console.error('Missing TELEGRAM_BOT_TOKEN in environment.');
  process.exit(1);
}
if (!serverUrl) {
  console.error('Usage: TELEGRAM_BOT_TOKEN=... node scripts/setTelegramWebhook.js https://<your-railway-url> [secret]');
  process.exit(1);
}

const webhookUrl = `${serverUrl.replace(/\/$/, '')}/api/telegram/webhook`;
const params = new URLSearchParams({ url: webhookUrl });
if (secretToken) params.set('secret_token', secretToken);

https.get(`https://api.telegram.org/bot${token}/setWebhook?${params.toString()}`, res => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    const result = JSON.parse(data);
    if (result.ok) {
      console.log(`Webhook set: ${webhookUrl}`);
      console.log(result.description || '');
    } else {
      console.error('Failed to set webhook:', result.description || data);
      process.exit(1);
    }
  });
}).on('error', err => {
  console.error('Request failed:', err.message);
  process.exit(1);
});
