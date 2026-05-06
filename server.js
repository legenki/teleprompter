var app = require('express')();
var cors = require('cors');
var express = require('express');
var path = require('path');
var http = require('http').createServer(app);

// CORS configuration - whitelist specific origins for production
var allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:8080'];

var io = require('socket.io')(http, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.static(path.join(__dirname, '/')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Route for remote control page
app.get('/remote', function(req, res) {
  res.sendFile(path.join(__dirname, 'remote.html'));
});

// Default route for index
app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Rate limiting map for connections
var connectionLimits = {};

io.on('connection', function(socket) {
  var clientIp = socket.handshake.address;

  socket.on('connectToRemote', function(id) {
    // Validate room ID format (6 alphanumeric chars prefixed with REMOTE_)
    if (typeof id !== 'string' || !/^REMOTE_[A-Z0-9]{6}$/.test(id)) {
      console.warn('Invalid room ID attempted:', id, 'from', clientIp);
      return;
    }

    socket.room = id;
    socket.join(id);
    socket.emit('connectedToRemote', id);
    socket.broadcast.to(id).emit('connectedToRemote', id);
  });

  socket.on('sendRemoteControl', function(command, value) {
    // Rate limiting: max 10 commands per second per client
    var now = Date.now();
    if (!connectionLimits[clientIp]) {
      connectionLimits[clientIp] = { count: 0, resetTime: now + 1000 };
    }

    if (now > connectionLimits[clientIp].resetTime) {
      connectionLimits[clientIp] = { count: 0, resetTime: now + 1000 };
    }

    if (connectionLimits[clientIp].count++ > 10) {
      console.warn('Rate limit exceeded for', clientIp);
      return;
    }

    socket.emit('remoteControl', command, value);
    socket.broadcast.to(socket.room).emit('remoteControl', command, value);
  });

  socket.on('clientCommand', function(command, value) {
    // Basic validation of command type
    if (typeof command !== 'string') {
      console.warn('Invalid command type from', clientIp);
      return;
    }

    socket.emit('clientCommand', command, value);
    socket.broadcast.to(socket.room).emit('clientCommand', command, value);
  });

  socket.on('disconnect', function() {
    // Cleanup rate limiting on disconnect
    delete connectionLimits[clientIp];
  });
});

var PORT = process.env.PORT || 3000;
http.listen(PORT, function() {
  console.log('TelePrompter server listening on port', PORT);
  if (process.env.NODE_ENV === 'production') {
    console.log('Production mode - CORS restricted to:', allowedOrigins.join(', '));
  }
});
