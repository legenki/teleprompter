import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { relayUrl } from '../extension/lib/phone-link.js';

const require = createRequire(import.meta.url);
const { createRelay, sanitizeCard } = require('../copilot-server.js');
const { WebSocket } = require('ws');

async function start() {
  const relay = createRelay({ token: 'SECRET42' });
  const port = await relay.listen(0, '127.0.0.1');
  return { relay, port };
}

const open = (port, role, t) => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?role=${role}&t=${t}`);
  const msgs = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d)));
  // The server may accept the upgrade and then close with 1008, so only count the socket as open if it stays open.
  ws.on('open', () => setTimeout(() => { if (ws.readyState === 1) resolve({ ws, msgs }); }, 100));
  ws.on('close', (code) => reject(Object.assign(new Error('closed'), { code })));
  ws.on('error', () => {});
});
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));

test('relay rejects a wrong token', async () => {
  const { relay, port } = await start();
  try {
    await assert.rejects(open(port, 'sub', 'WRONG'), (e) => e.code === 1008);
  } finally {
    await relay.close();
  }
});

test('relay delivers cards to subscribers, upserts by id, and replays a snapshot', async () => {
  const { relay, port } = await start();
  const pub = await open(port, 'pub', 'SECRET42');
  const sub1 = await open(port, 'sub', 'SECRET42');
  pub.ws.send(JSON.stringify({ type: 'card', card: { id: 1, en: 'Hi', ru: 'При', answers: ['a'] } }));
  pub.ws.send(JSON.stringify({ type: 'card', card: { id: 1, en: 'Hi', ru: 'Привет', answers: ['a', 'b'] } }));
  await wait();
  assert.deepEqual(sub1.msgs.map((m) => m.type), ['snapshot', 'card', 'card']);
  assert.equal(sub1.msgs[2].card.ru, 'Привет');

  const late = await open(port, 'sub', 'SECRET42'); // joins mid-interview
  await wait();
  assert.equal(late.msgs[0].type, 'snapshot');
  assert.equal(late.msgs[0].cards.length, 1);
  assert.equal(late.msgs[0].cards[0].answers.length, 2);

  pub.ws.send(JSON.stringify({ type: 'clear' }));
  await wait();
  assert.equal(sub1.msgs.at(-1).type, 'clear');
  for (const c of [pub, sub1, late]) c.ws.close();
  await relay.close();
});

test('subscribers cannot publish', async () => {
  const { relay, port } = await start();
  const sub = await open(port, 'sub', 'SECRET42');
  const other = await open(port, 'sub', 'SECRET42');
  sub.ws.send(JSON.stringify({ type: 'card', card: { id: 9, en: 'spoof' } }));
  await wait();
  assert.equal(other.msgs.filter((m) => m.type === 'card').length, 0);
  sub.ws.close(); other.ws.close();
  await relay.close();
});

test('sanitizeCard limits sizes and drops junk', () => {
  assert.equal(sanitizeCard(null), null);
  assert.equal(sanitizeCard({ en: 'no id' }), null);
  const c = sanitizeCard({ id: 5, en: 'x'.repeat(5000), answers: ['a', 'b', 'c', 'd', 'e'], keys: new Array(20).fill('k'), evil: '<script>' });
  assert.equal(c.en.length, 2000);
  assert.equal(c.answers.length, 3);
  assert.equal(c.keys.length, 8);
  assert.equal(c.evil, undefined);
});

test('relayUrl normalizes the address', () => {
  assert.equal(relayUrl('localhost:3100', 'abc'), 'ws://localhost:3100/ws?role=pub&t=abc');
  assert.equal(relayUrl('http://192.168.1.5:3100/', 'a b'), 'ws://192.168.1.5:3100/ws?role=pub&t=a%20b');
  assert.equal(relayUrl('', 'x'), null);
});
