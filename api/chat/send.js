const { handleCors } = require('../../lib/cors');
const { validateMessage, sanitizeText } = require('../../lib/security');
const { saveMessage } = require('../../lib/storage');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  }

  // Parse body
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) {}
  }
  if (!body) body = {};

  const { senderId, senderName, receiverId, receiverName, text, timestamp } = body;

  if (!senderId || !receiverId) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'senderId and receiverId are required' }));
  }

  const validation = validateMessage(text);
  if (!validation.valid) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: validation.error }));
  }

  const cleanText = sanitizeText(validation.text);

  const saved = await saveMessage({
    senderId,
    senderName: sanitizeText(senderName),
    receiverId,
    receiverName: sanitizeText(receiverName),
    text: cleanText,
    timestamp: timestamp || Date.now()
  });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ success: true, message: saved }));
};
