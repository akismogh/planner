// Local-only Express server.
// Reads and writes /data.json in the project root.
// Listens on 127.0.0.1 only so the app is never exposed to the network.

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const DATA_FILE = path.join(__dirname, '..', 'data.json');

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '2mb' }));

// GET /api/data — returns saved inputs or null if no file yet.
app.get('/api/data', (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) return res.json(null);
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } catch (err) {
    console.error('Failed to read data.json:', err);
    res.status(500).json({ error: 'Failed to read data file' });
  }
});

// POST /api/data — overwrites data.json with the request body.
app.post('/api/data', (req, res) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to write data.json:', err);
    res.status(500).json({ error: 'Failed to write data file' });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] listening at http://127.0.0.1:${PORT}`);
  console.log(`[server] data file: ${DATA_FILE}`);
});
