const https = require('https');

// Authoritative user profile cache (userId -> { username, bio, timestamp })
const userProfileCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Strips dangerous HTML, control characters, and trims whitespace.
 */
function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim();
}

/**
 * Validates message length and content.
 */
function validateMessage(text) {
  if (!text || typeof text !== 'string') {
    return { valid: false, error: 'Message text is required' };
  }
  const clean = text.trim();
  if (clean.length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }
  if (clean.length > 500) {
    return { valid: false, error: 'Message exceeds maximum length of 500 characters' };
  }
  return { valid: true, text: clean };
}

// In-memory sliding-window rate limiter per sender
const rateLimitMap = new Map();
const RATE_WINDOW_MS = 3000; // 3 seconds
const RATE_MAX_MESSAGES = 5;

/**
 * Enforces rate limiting: max 5 messages per 3 seconds per senderId.
 */
function checkRateLimit(senderId) {
  const now = Date.now();
  const id = String(senderId);
  const timestamps = rateLimitMap.get(id) || [];
  const validTimestamps = timestamps.filter(t => now - t < RATE_WINDOW_MS);

  if (validTimestamps.length >= RATE_MAX_MESSAGES) {
    return { allowed: false, error: 'You are sending messages too quickly. Please wait a moment.' };
  }

  validTimestamps.push(now);
  rateLimitMap.set(id, validTimestamps);
  return { allowed: true };
}

/**
 * Authoritative PlayVortex user resolver.
 * Directly queries https://playvortex.io/api/users/:id to prevent spoofing.
 */
async function getAuthoritativeVortexUser(userId) {
  const uid = String(userId).trim();
  if (!uid || !/^\d+$/.test(uid)) return null;

  const cached = userProfileCache.get(uid);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  return new Promise((resolve) => {
    const req = https.get(`https://playvortex.io/api/users/${uid}`, {
      headers: {
        'User-Agent': 'BTVortex-Server/1.0',
        'Accept': 'application/json'
      },
      timeout: 5000
    }, (res) => {
      if (res.statusCode !== 200) {
        return resolve(null);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.id && parsed.username) {
            const userData = {
              id: String(parsed.id),
              username: String(parsed.username),
              bio: String(parsed.bio || '')
            };
            userProfileCache.set(uid, { timestamp: Date.now(), data: userData });
            return resolve(userData);
          }
        } catch (e) {}
        resolve(null);
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}


const friendsCache = new Map(); // uid -> { timestamp, friendIds: Set }

function areUsersFriends(user1Id, user2Id) {
  const u1 = String(user1Id || '').trim();
  const u2 = String(user2Id || '').trim();
  if (!u1 || !u2 || u1 === u2) return Promise.resolve(false);

  const cached = friendsCache.get(u1);
  if (cached && (Date.now() - cached.timestamp < 30000)) {
    return Promise.resolve(cached.friendIds.has(u2));
  }

  return new Promise((resolve) => {
    const req = https.get('https://playvortex.io/api/friends/' + encodeURIComponent(u1), {
      headers: { 'User-Agent': 'BTVortex-Server/1.0' },
      timeout: 4000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          let list = [];
          if (Array.isArray(parsed)) list = parsed;
          else if (Array.isArray(parsed?.friends)) list = parsed.friends;
          else if (Array.isArray(parsed?.data)) list = parsed.data;
          else if (Array.isArray(parsed?.users)) list = parsed.users;

          const idSet = new Set(list.map(f => String(f.id || f.user_id)));
          friendsCache.set(u1, { timestamp: Date.now(), friendIds: idSet });
          resolve(idSet.has(u2));
        } catch (e) {
          resolve(false);
        }
      });
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

module.exports = {
  areUsersFriends,
  sanitizeText,
  validateMessage,
  checkRateLimit,
  getAuthoritativeVortexUser
};
