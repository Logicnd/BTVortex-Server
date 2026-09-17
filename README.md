# BTVortex-Server

Backend serverless API for **BTVortex** real-time chat, private linkers, and cloud data synchronization.

Designed to run locally with zero dependencies or deployed seamlessly to **Vercel** with 1 click.

---

## Features

- **Real-Time Multi-User Chat**:
  - `POST /api/chat/send`: Dispatches messages between players.
  - `GET /api/chat/messages`: Retrieves conversation history between users.
  - `GET /api/chat/conversations`: Lists active conversations for a player with snippets and unread counts.
  - `GET /api/chat/sync`: Real-time delta polling for incoming messages.
  - `POST /api/chat/read`: Marks conversation messages as read.
- **Private Linkers**:
  - `POST /api/linker/verify`: Verification endpoint for private tokens, accounts, and session linking.
- **Storage Flexibility**:
  - **Local Development**: Automatic local in-memory and persistent file storage (`./data/chat_store.json`).
  - **Production Vercel**: 1-click support for **Vercel KV / Upstash Redis** for global persistent multi-region chat.
- **Full CORS Support**: Pre-configured for `playvortex.io`, extension origins, and `localhost`.

---

## Local Development

Start the local server (runs on port 3000 by default):

```bash
node server.js
```

Test the health check:

```bash
curl http://localhost:3000/api
```

---

## How to Commit & Deploy to Vercel

1. **Initialize Git & Commit**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of BTVortex-Server"
   ```

2. **Push to GitHub**:
   - Create a new repository on GitHub (e.g. `BTVortex-Server`).
   - Push your code:
     ```bash
     git remote add origin https://github.com/YOUR_USERNAME/BTVortex-Server.git
     git branch -M main
     git push -u origin main
     ```

3. **Deploy on Vercel**:
   - Go to [vercel.com](https://vercel.com) and click **"Add New Project"**.
   - Import your `BTVortex-Server` repository.
   - (Optional) In the project settings, add a **Vercel KV** database for global persistent chat messages across serverless cold starts.
   - Click **Deploy**!

4. **Connect BTVortex Extension**:
   - Once deployed, copy your Vercel URL (e.g. `https://btvortex-server.vercel.app`).
   - In PlayVortex, open **BTV Settings -> Features -> Backend Server URL** and paste your URL!
