'use strict';

const assert = require('assert');
const {
  classifyNewsletter,
  extractMessageBody,
  buildRawMessage,
  htmlToText
} = require('./gmailIntegration.js');

function msg(labels) { return { labelIds: labels || [] }; }

assert.strictEqual(classifyNewsletter(msg(['CATEGORY_PROMOTIONS']), {}), true);
assert.strictEqual(classifyNewsletter(msg([]), { 'list-unsubscribe': '<mailto:unsubscribe@example.com>' }), true);
assert.strictEqual(classifyNewsletter(msg([]), { 'list-id': '<news.example.com>' }), true);
assert.strictEqual(classifyNewsletter(msg([]), { precedence: 'bulk' }), true);
assert.strictEqual(classifyNewsletter(msg(['INBOX']), { from: 'person@example.com' }), false);

const plainPayload = {
  mimeType: 'multipart/alternative',
  parts: [{ mimeType: 'text/plain', body: { data: Buffer.from('Hallo Daniel').toString('base64url') } }]
};
assert.strictEqual(extractMessageBody(plainPayload), 'Hallo Daniel');

const htmlPayload = {
  mimeType: 'text/html',
  body: { data: Buffer.from('<p>Hallo <strong>Daniel</strong></p><script>bad()</script>').toString('base64url') }
};
assert.strictEqual(extractMessageBody(htmlPayload), 'Hallo Daniel');
assert.strictEqual(htmlToText('<p>A&amp;B</p>'), 'A&B');

const raw = Buffer.from(buildRawMessage({
  to: 'test@example.com',
  subject: 'Hallo',
  body: 'Zeile 1\nZeile 2'
}), 'base64url').toString('utf8');
assert.ok(raw.includes('To: test@example.com'));
assert.ok(raw.includes('Subject: Hallo'));
assert.ok(raw.includes('Zeile 1\r\nZeile 2'));

assert.throws(() => buildRawMessage({ to: '', subject: 'X', body: 'Y' }), /invalid_recipient/);
assert.throws(() => buildRawMessage({ to: 'a@example.com', subject: '', body: 'Y' }), /invalid_subject/);

console.log('Gmail integration unit tests: OK');
