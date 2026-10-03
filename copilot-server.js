// Phone relay for Interview Copilot: the extension publishes cards, a phone browser on the same
// network subscribes. Plain WebSocket + token. Usage: `npm run phone`.
var http = require('http');
var fs = require('fs');
var os = require('os');
var path = require('path');
var crypto = require('crypto');
var WebSocketServer = require('ws').WebSocketServer;

var MAX_CARDS = 40;
var TOKEN_FILE = path.join(__dirname, '.copilot-token');

function loadToken() {
  if (process.env.COPILOT_TOKEN) return process.env.COPILOT_TOKEN;
  try {
    var saved = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    if (saved) return saved;
  } catch (e) { /* first run */ }
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var token = Array.from(crypto.randomBytes(8), function (b) { return chars[b % chars.length]; }).join('');
  fs.writeFileSync(TOKEN_FILE, token + '\n', { mode: 384 });
  return token;
}

function safeEqual(a, b) {
  var ba = Buffer.from(String(a));
  var bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }

// Keep only known fields with sane sizes: the phone renders this text, so never trust it blindly.
function sanitizeCard(c) {
  if (!c || (typeof c.id !== 'number' && typeof c.id !== 'string')) return null;
  return {
    id: String(c.id).slice(0, 64),
    en: str(c.en, 2000),
    ru: str(c.ru, 2000),
    isQ: !!c.isQ,
    keys: Array.isArray(c.keys) ? c.keys.slice(0, 8).map(function (k) { return str(k, 80); }) : [],
    answers: Array.isArray(c.answers) ? c.answers.slice(0, 3).map(function (a) { return str(a, 600); }) : [],
    meta: str(c.meta, 200),
  };
}

function createRelay(opts) {
  opts = opts || {};
  var token = opts.token || loadToken();
  var cards = [];
  var fails = {};

  var server = http.createServer(function (req, res) {
    var url = new URL(req.url, 'http://x');
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      fs.createReadStream(path.join(__dirname, 'copilot-phone.html')).pipe(res);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  var wss = new WebSocketServer({ server: server, path: '/ws', maxPayload: 256 * 1024 });

  function broadcast(msg) {
    var data = JSON.stringify(msg);
    wss.clients.forEach(function (c) {
      if (c.readyState === 1 && c.role === 'sub') c.send(data);
    });
  }

  wss.on('connection', function (ws, req) {
    var url = new URL(req.url, 'http://x');
    var ip = req.socket.remoteAddress;
    var now = Date.now();
    var f = fails[ip];
    if (f && now < f.until && f.count >= 10) { ws.close(1008, 'too many attempts'); return; }

    if (!safeEqual(url.searchParams.get('t') || '', token)) {
      fails[ip] = { count: ((f && now < f.until) ? f.count : 0) + 1, until: now + 60000 };
      ws.close(1008, 'bad token');
      return;
    }

    ws.role = url.searchParams.get('role') === 'pub' ? 'pub' : 'sub';
    ws.isAlive = true;
    ws.on('pong', function () { ws.isAlive = true; });

    if (ws.role === 'sub') {
      ws.send(JSON.stringify({ type: 'snapshot', cards: cards }));
      return;
    }

    ws.on('message', function (raw) {
      var msg;
      try { msg = JSON.parse(raw); } catch (e) { return; }
      if (msg.type === 'card') {
        var card = sanitizeCard(msg.card);
        if (!card) return;
        var i = cards.findIndex(function (c) { return c.id === card.id; });
        if (i >= 0) cards[i] = card; else cards.push(card);
        if (cards.length > MAX_CARDS) cards.shift();
        broadcast({ type: 'card', card: card });
      } else if (msg.type === 'clear') {
        cards = [];
        broadcast({ type: 'clear' });
      }
    });
  });

  var beat = setInterval(function () {
    wss.clients.forEach(function (c) {
      if (!c.isAlive) { c.terminate(); return; }
      c.isAlive = false;
      c.ping();
    });
  }, 15000);
  beat.unref();

  return {
    token: token,
    server: server,
    listen: function (port, host) {
      return new Promise(function (resolve) {
        server.listen(port, host, function () { resolve(server.address().port); });
      });
    },
    close: function () {
      clearInterval(beat);
      wss.clients.forEach(function (c) { c.terminate(); });
      return new Promise(function (resolve) { wss.close(function () { server.close(resolve); }); });
    },
  };
}

function lanAddresses() {
  var out = [];
  var ifs = os.networkInterfaces();
  Object.keys(ifs).forEach(function (name) {
    ifs[name].forEach(function (i) { if (i.family === 'IPv4' && !i.internal) out.push(i.address); });
  });
  return out;
}

module.exports = { createRelay: createRelay, sanitizeCard: sanitizeCard };

if (require.main === module) {
  var PORT = Number(process.env.COPILOT_PORT) || 3100;
  var relay = createRelay();
  relay.listen(PORT, process.env.COPILOT_HOST || '0.0.0.0').then(function (port) {
    console.log('\nInterview Copilot phone relay on port ' + port);
    console.log('Pairing token: ' + relay.token + '  (stored in .copilot-token)\n');
    console.log('1) Extension → Settings → Phone display: relay "localhost:' + port + '", token above, switch On.');
    console.log('2) On the phone (same Wi-Fi) open one of:');
    lanAddresses().forEach(function (ip) { console.log('   http://' + ip + ':' + port + '/?t=' + relay.token); });
    console.log('\nTraffic is plain HTTP/WS inside your network, protected only by the token. Use a network you trust.\n');
  });
}
