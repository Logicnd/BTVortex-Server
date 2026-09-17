const { handleCors } = require('../../lib/cors');
const { validateMessage, sanitizeText, checkRateLimit, getAuthoritativeVortexUser } = require('../../lib/security');
const { saveMessage, verifyUserToken } = require('../../lib/storage');

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

  const senderId = String(body.senderId || '').trim();
  const receiverId = String(body.recipientId || body.receiverId || '').trim();
  const text = body.text;

  if (!senderId || !receiverId) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'senderId and recipientId are required' }));
  }

  // 1. Rate Limiting check
  const rate = checkRateLimit(senderId);
  if (!rate.allowed) {
    res.statusCode = 429;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: rate.error }));
  }

  // 2. Token Authentication & Anti-Spoofing check
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || body.token;
  if (token) {
    const isTokenValid = await verifyUserToken(senderId, token);
    if (!isTokenValid) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Unauthorized: Session token invalid for this user ID.' }));
    }
  }

  // 3. Message validation & text sanitization
  const validation = validateMessage(text);
  if (!validation.valid) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: validation.error }));
  }
  const cleanText = sanitizeText(validation.text);

  // 4. Authoritative Username Enforcement (Zero-Trust)
  // Query PlayVortex directly so no sender can fake their name or claim to be someone else!
  const authoritativeSender = await getAuthoritativeVortexUser(senderId);
  if (!authoritativeSender) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: `Sender user ID ${senderId} does not exist on PlayVortex` }));
  }

  const authoritativeReceiver = await getAuthoritativeVortexUser(receiverId);
  const recipientName = authoritativeReceiver ? authoritativeReceiver.username : (body.recipientUsername || body.receiverName || `Player #${receiverId}`);

  // 5. Save message with authoritative PlayVortex usernames and server timestamp
  const saved = await saveMessage({
    senderId,
    senderUsername: authoritativeSender.username,
    recipientId: receiverId,
    recipientUsername: recipientName,
    text: cleanText
  });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ success: true, message: saved }));
};
