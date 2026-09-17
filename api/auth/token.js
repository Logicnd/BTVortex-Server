const { handleCors } = require('../../lib/cors');
const { getOrIssueAuthToken } = require('../../lib/storage');
const { getAuthoritativeVortexUser } = require('../../lib/security');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {}
  }
  if (!body) body = {};

  const { userId, clientToken } = body;
  if (!userId) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'userId is required' }));
  }

  // Verify that user exists on PlayVortex
  const authoritativeUser = await getAuthoritativeVortexUser(userId);
  if (!authoritativeUser) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'User does not exist on PlayVortex' }));
  }

  const result = await getOrIssueAuthToken(userId, clientToken);

  if (result.requiresVerification) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      success: false,
      error: 'Account token already bound to another session. Link account via bio verification to reset.',
      requiresLinker: true,
      userId: String(userId),
      username: authoritativeUser.username
    }));
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    success: true,
    token: result.token,
    isNew: Boolean(result.isNew),
    userId: String(userId),
    username: authoritativeUser.username
  }));
};
