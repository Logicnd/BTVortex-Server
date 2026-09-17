const fs = require('fs');
const path = require('path');
const https = require('https');

// Local in-memory / file cache
let localStore = {
  messages: [],      // Array of message objects
  conversations: {}  // map of "${user1}_${user2}" -> meta
};

const dataDir = path.resolve(__dirname, '../data');
const dataFile = path.join(dataDir, 'chat_store.json');

// Load local persistent storage if available
try {
  if (fs.existsSync(dataFile)) {
    const raw = fs.readFileSync(dataFile, 'utf8');
    localStore = JSON.parse(raw);
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
  
  return new Promise((resolve, reject) => {
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
  const ids = [String(u1), String(u2)].sort();
  return `${ids[0]}_${ids[1]}`;
}

// Storage Interface
async function saveMessage({ senderId, senderName, receiverId, receiverName, text, timestamp }) {
  const msg = {
    id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    senderId: String(senderId),
    senderName: senderName || `Player #${senderId}`,
    receiverId: String(receiverId),
    receiverName: receiverName || `Player #${receiverId}`,
    text,
    timestamp: timestamp || Date.now(),
    read: false
  };

  const pairKey = getPairKey(msg.senderId, msg.receiverId);

  // In-memory / file fallback
  localStore.messages.push(msg);
  if (!localStore.conversations[pairKey]) {
    localStore.conversations[pairKey] = {
      pairKey,
      users: [msg.senderId, msg.receiverId],
      userNames: { [msg.senderId]: msg.senderName, [msg.receiverId]: msg.receiverName },
      lastMessage: msg,
      updatedAt: msg.timestamp
    };
  } else {
    localStore.conversations[pairKey].lastMessage = msg;
    localStore.conversations[pairKey].updatedAt = msg.timestamp;
    localStore.conversations[pairKey].userNames[msg.senderId] = msg.senderName;
    localStore.conversations[pairKey].userNames[msg.receiverId] = msg.receiverName;
  }
  persistLocalStore();

  // Cloud KV if configured
  if (hasKV) {
    try {
      await kvCommand('LPUSH', `convo:${pairKey}`, JSON.stringify(msg));
      await kvCommand('SET', `convo_meta:${pairKey}`, JSON.stringify(localStore.conversations[pairKey]));
      await kvCommand('SADD', `user_convos:${msg.senderId}`, pairKey);
      await kvCommand('SADD', `user_convos:${msg.receiverId}`, pairKey);
      await kvCommand('LPUSH', `user_inbox:${msg.receiverId}`, JSON.stringify(msg));
    } catch (e) {}
  }

  return msg;
}

async function getMessages(u1, u2, limit = 50) {
  const pairKey = getPairKey(u1, u2);
  const u1s = String(u1);
  const u2s = String(u2);

  const matched = localStore.messages.filter(m => 
    (m.senderId === u1s && m.receiverId === u2s) ||
    (m.senderId === u2s && m.receiverId === u1s)
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
      
      // Calculate unread
      const unreadCount = localStore.messages.filter(m => 
        m.senderId === otherId && m.receiverId === uid && !m.read
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
    m.receiverId === uid && m.timestamp > since
  );
}

async function markRead(userId, senderId) {
  const uid = String(userId);
  const sid = String(senderId);
  let count = 0;

  localStore.messages.forEach(m => {
    if (m.receiverId === uid && m.senderId === sid && !m.read) {
      m.read = true;
      count++;
    }
  });

  if (count > 0) {
    persistLocalStore();
  }
  return { markedCount: count };
}

module.exports = {
  saveMessage,
  getMessages,
  getConversations,
  getSyncMessages,
  markRead
};
