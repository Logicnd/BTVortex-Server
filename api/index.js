const { handleCors } = require('../lib/cors');
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  const accept = req.headers['accept'] || '';
  if (accept.includes('text/html') && !req.url.includes('format=json')) {
    try {
      const htmlPath = path.resolve(__dirname, '../public/index.html');
      if (fs.existsSync(htmlPath)) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(fs.readFileSync(htmlPath, 'utf8'));
      }
    } catch (e) {}
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    service: 'BTVortex-Server',
    status: 'online',
    version: '1.1.0',
    antiSpoofing: 'authoritative_vortex_enforced',
    domain: 'https://bt-vortex-server.vercel.app',
    endpoints: [
      '/api/auth/token',
      '/api/chat/send',
      '/api/chat/messages',
      '/api/chat/conversations',
      '/api/chat/sync',
      '/api/chat/read',
      '/api/linker/verify'
    ],
    timestamp: Date.now()
  }));
};
