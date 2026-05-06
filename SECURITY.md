# Security Policy

## Security Fixes in v1.2.3

### CORS Configuration
- **Fixed**: CORS now restricts origins to whitelist instead of allowing all (`origin: '*'`)
- **Impact**: Prevents cross-origin Socket.IO connections from arbitrary websites
- **Configuration**: Set `CORS_ORIGINS` environment variable for production

Example for production:
```bash
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com npm run server
```

### Protocol-Aware Socket.IO Connections
- **Fixed**: Removed hardcoded `promptr.tv` domain and HTTP-only connections
- **Impact**: Now respects HTTPS/HTTP protocol of current origin
- **Benefit**: Properly supports self-hosted instances with HTTPS

### Input Validation
- **Added**: Room ID format validation on Socket.IO connections
- **Added**: Command type validation for client commands
- **Impact**: Prevents malformed data from being broadcast

### Rate Limiting
- **Added**: Per-client rate limiting on `sendRemoteControl` events
- **Limit**: Maximum 10 commands per second per IP address
- **Impact**: Prevents event flooding and DoS attacks

## Deployment Security

### Production Environment
Always set production mode when deploying:
```bash
NODE_ENV=production CORS_ORIGINS=https://yourdomain.com npm run server
```

### HTTPS
When deploying behind a reverse proxy (Nginx/Apache):
1. Terminate TLS at the proxy
2. Use `X-Forwarded-Proto` header
3. Ensure WebSocket upgrade headers are passed through

Example Nginx configuration:
```nginx
location /socket.io {
  proxy_pass http://localhost:3000;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_http_version 1.1;
}
```

### Docker Deployment
Use specific Node.js version:
```dockerfile
FROM node:18-alpine  # pinned version, not latest
```

## Reporting Security Issues

Please email security concerns to the project maintainer instead of opening public issues.

Do not disclose security vulnerabilities publicly until a fix is available.

## Known Limitations

- **Authentication**: TelePrompter does not implement user authentication. Remote IDs are 6-character random strings.
- **Encryption**: Data transmitted over unencrypted HTTP is not encrypted. Always use HTTPS in production.
- **Local Network**: Designed for local network or trusted environments. Not recommended for untrusted networks without additional security measures.

## Security Best Practices

1. **Use HTTPS in Production**: Always deploy behind TLS termination proxy
2. **Restrict CORS Origins**: Whitelist specific domains in `CORS_ORIGINS`
3. **Network Isolation**: Keep server on private network or behind firewall
4. **Monitor Logs**: Enable logging to detect suspicious activity
5. **Keep Dependencies Updated**: Run `npm audit` regularly and apply patches

## Changelog

### v1.2.3
- Fixed CORS configuration to whitelist origins
- Added input validation for Socket.IO events
- Added rate limiting for remote control commands
- Removed hardcoded domain references
- Fixed file:// protocol handling for local development
- Updated Docker to use Node.js 18-alpine

### Previous Versions
See [CHANGELOG.md](CHANGELOG.md)
