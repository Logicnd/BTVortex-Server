const { handleCors } = require('../../lib/cors');
const { purgeAllData } = require('../../lib/storage');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST' && req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  }

  const result = await purgeAllData();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ success: true, message: 'All chat logs and stored data purged successfully', ...result }));
};
