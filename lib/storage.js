const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// Local in-memory / file cache
let localStore = {
  messages: [],            // Array of message objects
  conversations: {},       // map of "${user1}_${user2}" -> meta
  authTokens: {},          // userId -> token
  pendingLinkerCodes: {}   // userId -> { code, expiresAt }
};

const dataDir = path.resolve(__dirname, '../data');
const dataFile = path.join(dataDir, 'chat_store.json');

// Load local persistent storage if available
try {
  if (fs.existsSync(dataFile)) {
    const raw = fs.readFileSync(dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    localStore = {
      messages: parsed.messages || [],
      conversations: parsed.conversations || {},
      authTokens: parsed.authTokens || {},
      pendingLinkerCodes: parsed.pendingLinkerCodes || {}
    };
  }
} catch (e) {}

function persistLocalStore() {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify(localStore, null, 2), 'utf8');
  } catch (e) {}
}

// Check if Vercel KV / Upstash Redis is configured
const hasKV = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

async function kvCommand(cmd, ...args) {
  if (!hasKV) return null;
  const url = new URL(process.env.KV_REST_API_URL);
  const endpoint = `${url.origin}/${[cmd, ...args.map(encodeURIComponent)].join('/')}`;
  
  return new Promise((resolve) => {
    const req = https.get(endpoint, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.result);
        } catch (err) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
  });
}

function getPairKey(u1, u2) {
  const ids = [String(u1), String(u2)].sort((a, b) => Number(a) - Number(b));
  return `${ids[0]}_${ids[1]}`;
}

// Token Verification
async function getOrIssueAuthToken(userId, clientToken = null) {
  const uid = String(userId);
  let existing = localStore.authTokens[uid];
  if (hasKV && !existing) {
    existing = await kvCommand('GET', `auth_token:${uid}`);
  }

  if (!existing) {
    const newToken = crypto.randomBytes(32).toString('hex');
    localStore.authTokens[uid] = newToken;
    persistLocalStore();
    if (hasKV) await kvCommand('SET', `auth_token:${uid}`, newToken);
    return { token: newToken, isNew: true };
  }

  if (clientToken && clientToken === existing) {
    return { token: existing, isNew: false };
  }

  return { token: existing, isNew: false, requiresVerification: true };
}

async function verifyUserToken(userId, token) {
  if (!userId || !token) return false;
  const uid = String(userId);
  let stored = localStore.authTokens[uid];
  if (hasKV && !stored) {
    stored = await kvCommand('GET', `auth_token:${uid}`);
  }
  if (!stored) {
    // If no token registered yet, automatically register this first token
    localStore.authTokens[uid] = token;
    persistLocalStore();
    if (hasKV) await kvCommand('SET', `auth_token:${uid}`, token);
    return true;
  }
  return stored === token;
}

function generateLinkerCode(userId) {
  const uid = String(userId);
  const code = 'btv-' + Math.random().toString(36).substring(2, 8);
  localStore.pendingLinkerCodes[uid] = {
    code,
    expiresAt: Date.now() + 15 * 60 * 1000 // 15 mins
  };
  persistLocalStore();
  return code;
}

function getPendingLinkerCode(userId) {
  const uid = String(userId);
  const item = localStore.pendingLinkerCodes[uid];
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    delete localStore.pendingLinkerCodes[uid];
    return null;
  }
  return item.code;
}

function completeBioLinker(userId) {
  const uid = String(userId);
  delete localStore.pendingLinkerCodes[uid];
  const newToken = crypto.randomBytes(32).toString('hex');
  localStore.authTokens[uid] = newToken;
  persistLocalStore();
  return newToken;
}

// Storage Interface
async function saveMessage({ senderId, senderUsername, senderName, recipientId, receiverId, recipientUsername, receiverName, text }) {
  const sid = String(senderId);
  const rid = String(recipientId || receiverId);
  const sName = senderUsername || senderName || `Player #${sid}`;
  const rName = recipientUsername || receiverName || `Player #${rid}`;

  const msg = {
    id: 'msg_' + crypto.randomUUID(),
    senderId: sid,
    senderUsername: sName,
    senderName: sName,
    recipientId: rid,
    receiverId: rid,
    recipientUsername: rName,
    receiverName: rName,
    text,
    timestamp: Date.now(),
    read: false
  };

  const pairKey = getPairKey(msg.senderId, msg.recipientId);

  // In-memory / file fallback
  localStore.messages.push(msg);
  if (!localStore.conversations[pairKey]) {
    localStore.conversations[pairKey] = {
      pairKey,
      users: [msg.senderId, msg.recipientId],
      userNames: { [msg.senderId]: msg.senderUsername, [msg.recipientId]: msg.recipientUsername },
      lastMessage: msg,
      updatedAt: msg.timestamp
    };
  } else {
    localStore.conversations[pairKey].lastMessage = msg;
    localStore.conversations[pairKey].updatedAt = msg.timestamp;
    localStore.conversations[pairKey].userNames[msg.senderId] = msg.senderUsername;
    localStore.conversations[pairKey].userNames[msg.recipientId] = msg.recipientUsername;
  }
  persistLocalStore();

  // Cloud KV if configured
  if (hasKV) {
    try {
      await kvCommand('LPUSH', `convo:${pairKey}`, JSON.stringify(msg));
      await kvCommand('SET', `convo_meta:${pairKey}`, JSON.stringify(localStore.conversations[pairKey]));
      await kvCommand('SADD', `user_convos:${msg.senderId}`, pairKey);
      await kvCommand('SADD', `user_convos:${msg.recipientId}`, pairKey);
      await kvCommand('LPUSH', `user_inbox:${msg.recipientId}`, JSON.stringify(msg));
    } catch (e) {}
  }

  return msg;
}

async function getMessages(u1, u2, limit = 50) {
  const pairKey = getPairKey(u1, u2);
  const u1s = String(u1);
  const u2s = String(u2);

  const matched = localStore.messages.filter(m => 
    (m.senderId === u1s && (m.recipientId === u2s || m.receiverId === u2s)) ||
    (m.senderId === u2s && (m.recipientId === u1s || m.receiverId === u1s))
  );

  matched.sort((a, b) => a.timestamp - b.timestamp);
  return matched.slice(-Math.min(limit, 100));
}

async function getConversations(userId) {
  const uid = String(userId);
  const result = [];

  for (const [pairKey, meta] of Object.entries(localStore.conversations)) {
    if (meta.users && meta.users.includes(uid)) {
      const otherId = meta.users.find(id => id !== uid) || uid;
      const otherName = meta.userNames ? meta.userNames[otherId] : `Player #${otherId}`;
      
      const unreadCount = localStore.messages.filter(m => 
        m.senderId === otherId && (m.recipientId === uid || m.receiverId === uid) && !m.read
      ).length;

      result.push({
        pairKey,
        targetUser: {
          id: otherId,
          username: otherName
        },
        lastMessage: meta.lastMessage,
        unreadCount,
        updatedAt: meta.updatedAt
      });
    }
  }

  result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return result;
}

async function getSyncMessages(userId, sinceTimestamp = 0) {
  const uid = String(userId);
  const since = Number(sinceTimestamp) || 0;

  return localStore.messages.filter(m => 
    (m.recipientId === uid || m.receiverId === uid) && m.timestamp > since
  );
}

async function markRead(userId, senderId) {
  const uid = String(userId);
  const sid = String(senderId);
  let count = 0;

  localStore.messages.forEach(m => {
    if ((m.recipientId === uid || m.receiverId === uid) && m.senderId === sid && !m.read) {
      m.read = true;
      count++;
    }
  });

  if (count > 0) {
    persistLocalStore();
  }
  return { markedCount: count };
}


async function purgeAllData() {
  localStore.messages = [];
  localStore.conversations = {};
  localStore.authTokens = {};
  localStore.pendingLinkerCodes = {};
  persistLocalStore();
  if (hasKV) {
    try {
      await kvCommand('FLUSHDB');
    } catch (e) {}
  }
  return { purged: true, timestamp: Date.now() };
}

module.exports = {
  purgeAllData,
  saveMessage,
  getMessages,
  getConversations,
  getSyncMessages,
  markRead,
  getOrIssueAuthToken,
  verifyUserToken,
  generateLinkerCode,
  getPendingLinkerCode,
  completeBioLinker
};
