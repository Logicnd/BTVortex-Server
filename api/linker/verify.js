const { handleCors } = require('../../lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) {}
  }
  if (!body) body = {};

  const { token, userId, username } = body;
  const secret = process.env.BTV_SERVER_SECRET;

  // If secret configured, verify token match or sign
  if (secret) {
    const headerSecret = req.headers['x-btv-secret'];
    if (headerSecret !== secret && token !== secret) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ success: false, error: 'Invalid secret or token' }));
    }
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    success: true,
    verified: true,
    userId: userId || null,
    username: username || null,
    issuedAt: Date.now()
  }));
};
