const { handleCors } = require('../../lib/cors');
const { getMessages } = require('../../lib/storage');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  const url = new URL(req.url, 'http://localhost');
  const user1 = url.searchParams.get('user1');
  const user2 = url.searchParams.get('user2');
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);

  if (!user1 || !user2) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'user1 and user2 query parameters are required' }));
  }

  const messages = await getMessages(user1, user2, limit);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ success: true, messages }));
};
