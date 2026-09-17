const { handleCors } = require('../../lib/cors');
const { getMessages, verifyUserToken } = require('../../lib/storage');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  const url = new URL(req.url, 'http://localhost');
  const user1 = url.searchParams.get('user1') || url.searchParams.get('u1');
  const user2 = url.searchParams.get('user2') || url.searchParams.get('u2');
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);

  if (!user1 || !user2) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'user1 and user2 query parameters are required' }));
  }

  // Token check
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || url.searchParams.get('token');
  if (token) {
    const isTokenValid = await verifyUserToken(user1, token);
    if (!isTokenValid) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Unauthorized: Session token invalid for user1.' }));
    }
  }

  const messages = await getMessages(user1, user2, limit);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ success: true, messages, count: messages.length }));
};
