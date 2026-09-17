const { handleCors } = require('../lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    service: 'BTVortex-Server',
    status: 'online',
    version: '1.0.0',
    endpoints: [
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
