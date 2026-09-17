const http = require('http');
const url = require('url');

const routes = {
  '/': require('./api/index.js'),
  '/api': require('./api/index.js'),
  '/api/auth/token': require('./api/auth/token.js'),
  '/api/chat/send': require('./api/chat/send.js'),
  '/api/chat/messages': require('./api/chat/messages.js'),
  '/api/chat/conversations': require('./api/chat/conversations.js'),
  '/api/chat/sync': require('./api/chat/sync.js'),
  '/api/chat/read': require('./api/chat/read.js'),
  '/api/chat/purge': require('./api/chat/purge.js'),
  '/api/linker/verify': require('./api/linker/verify.js')
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';

  // Read request body if present
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      req.body = body ? JSON.parse(body) : {};
    } catch (e) {
      req.body = body;
    }

    const handler = routes[pathname];
    if (handler) {
      try {
        await handler(req, res);
      } catch (err) {
        console.error('[Server Error]', pathname, err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Internal Server Error', message: err.message }));
      }
    } else {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Not Found', path: pathname }));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[BTVortex-Server] Running locally on http://localhost:${PORT}`);
  console.log(`[BTVortex-Server] Ready for Vercel deployment & BTVortex client connection`);
});
