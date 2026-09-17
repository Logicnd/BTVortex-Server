const { handleCors } = require('../../lib/cors');
const { generateLinkerCode, getPendingLinkerCode, completeBioLinker } = require('../../lib/storage');
const { getAuthoritativeVortexUser } = require('../../lib/security');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  const url = new URL(req.url, 'http://localhost');
  const action = url.searchParams.get('action');
  const queryUserId = url.searchParams.get('userId');

  // Action: request a new bio verification code (GET or POST)
  if (action === 'code' || req.method === 'GET') {
    const uid = queryUserId || (req.body && req.body.userId);
    if (!uid) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'userId is required' }));
    }

    const authUser = await getAuthoritativeVortexUser(uid);
    if (!authUser) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'User does not exist on PlayVortex' }));
    }

    const code = generateLinkerCode(uid);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      success: true,
      userId: uid,
      username: authUser.username,
      code,
      instructions: `Put ${code} anywhere in your PlayVortex profile bio, then click Verify!`
    }));
  }

  // Action: verify bio code (POST)
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }
    if (!body) body = {};

    const uid = body.userId || queryUserId;
    if (!uid) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'userId is required' }));
    }

    const expectedCode = getPendingLinkerCode(uid);
    if (!expectedCode) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'No active verification code found. Request a new code first.' }));
    }

    // Check live PlayVortex bio directly
    const authUser = await getAuthoritativeVortexUser(uid);
    if (!authUser) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'User does not exist on PlayVortex' }));
    }

    if (!authUser.bio || !authUser.bio.includes(expectedCode)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        success: false,
        error: `Verification code '${expectedCode}' was not found in your PlayVortex bio. Update your bio in Settings and try again!`,
        expectedCode
      }));
    }

    // Success! Re-issue and bind new token
    const newToken = completeBioLinker(uid);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      success: true,
      verified: true,
      token: newToken,
      userId: uid,
      username: authUser.username,
      message: 'Account verified successfully! You may now remove the code from your bio.'
    }));
  }

  res.statusCode = 405;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Method Not Allowed' }));
};
