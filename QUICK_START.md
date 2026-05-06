# TelePrompter - Quick Start Guide

## Local Development

```bash
# Install dependencies
npm install

# Start server (http://localhost:3000)
npm run server
```

Open browser to: **http://localhost:3000**

## Production Deployment

### Environment Variables Required

```bash
# Set these before starting
export NODE_ENV=production
export CORS_ORIGINS=https://yourdomain.com
export PORT=3000
```

### Docker

```bash
docker build -t teleprompter .
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e CORS_ORIGINS=https://yourdomain.com \
  teleprompter
```

### Behind Nginx Reverse Proxy

```nginx
server {
  listen 443 ssl http2;
  server_name yourdomain.com;
  
  ssl_certificate /path/to/cert;
  ssl_certificate_key /path/to/key;
  
  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  
  location /socket.io {
    proxy_pass http://localhost:3000/socket.io;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Security

⚠️ **Important for Production:**
- Always use HTTPS (via reverse proxy)
- Set `CORS_ORIGINS` to your domain
- Set `NODE_ENV=production`
- Keep Docker image and Node.js updated

See [SECURITY.md](SECURITY.md) for detailed security guidelines.

## Troubleshooting

### "CORS policy: Cross origin requests..."
- Ensure `CORS_ORIGINS` is set correctly
- Check that domain matches your deployment

### "file:// URLs not working"
- TelePrompter requires HTTP/HTTPS server
- Use `npm run server` for development
- Cannot be opened as local file

### Port already in use
```bash
# Change port
PORT=3001 npm run server
```

### Socket.IO not connecting
- Check that proxy headers are correct
- Ensure WebSocket upgrade is allowed
- Verify `CORS_ORIGINS` includes your domain

## Features

- ✅ Real-time text scrolling
- ✅ Remote control via separate device
- ✅ Keyboard shortcuts support
- ✅ Mobile responsive
- ✅ Progressive Web App (offline support)
- ✅ Settings saved to URL for sharing

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| <kbd>↑</kbd> | Increase font size |
| <kbd>↓</kbd> | Decrease font size |
| <kbd>←</kbd> / <kbd>PgUp</kbd> | Slow down |
| <kbd>→</kbd> / <kbd>PgDn</kbd> | Speed up |
| <kbd>Space</kbd> / <kbd>B</kbd> / <kbd>F5</kbd> / <kbd>.</kbd> | Play/Stop |
| <kbd>Esc</kbd> | Reset |

## Remote Control

1. Click "Remote" button in main app
2. Enter remote ID on `http://yourdomain.com/remote`
3. Use buttons to control main display

## More Information

- [CODE_REVIEW.md](CODE_REVIEW.md) - Full code review
- [SECURITY.md](SECURITY.md) - Security guidelines
- [FIXES_APPLIED.md](FIXES_APPLIED.md) - Recent changes
- [DEVELOPERS.md](DEVELOPERS.md) - Developer setup
