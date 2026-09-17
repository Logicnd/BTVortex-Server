const { handleCors } = require('../../lib/cors');
const { getSyncMessages } = require('../../lib/storage');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  const url = new URL(req.url, 'http://localhost');
  const userId = url.searchParams.get('userId');
  const since = parseInt(url.searchParams.get('since') || '0', 10);

  if (!userId) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'userId query parameter is required' }));
  }

  const newMessages = await getSyncMessages(userId, since);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ success: true, newMessages, timestamp: Date.now() }));
};
