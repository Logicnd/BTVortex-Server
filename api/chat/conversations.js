const { handleCors } = require('../../lib/cors');
const { getConversations } = require('../../lib/storage');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  const url = new URL(req.url, 'http://localhost');
  const userId = url.searchParams.get('userId');

  if (!userId) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'userId query parameter is required' }));
  }

  const convos = await getConversations(userId);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ success: true, conversations: convos }));
};
