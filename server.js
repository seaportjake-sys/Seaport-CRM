const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// On Render free tier, use /data if available (add a Render Disk mounted at /data)
// Fallback to local for dev
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'crm.db.json');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.db.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readDB() {
  ensureDir();
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch(e) {
    console.error('DB read error:', e.message);
  }
  return { leads: [], customers: [], logs: [], nextId: 1 };
}

function writeDB(data) {
  ensureDir();
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch(e) {
    console.error('DB write error:', e.message);
  }
}

function readScheduleDB() {
  ensureDir();
  try {
    if (fs.existsSync(SCHEDULE_FILE)) {
      return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
    }
  } catch(e) {}
  return { boats: [], lastReset: null };
}

function writeScheduleDB(data) {
  ensureDir();
  try {
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch(e) {
    console.error('Schedule DB write error:', e.message);
  }
}

// Seed demo leads if empty
function seedIfEmpty() {
  const db = readDB();
  if (db.leads && db.leads.length > 0) return;
  const now = new Date().toISOString();
  db.leads = [
    {id:1,name:"Mike Torrella",phone:"732-555-0182",email:"mtorrella@gmail.com",boat:"2025 Cape Horn 28XS",budget:145000,tradeIn:"2019 Grady-White 257",salesperson:"Jake",status:"Hot",lastContactDate:"2025-04-21",lastContactType:"Call",notes:"Very interested. Financing pre-approved.",followUpDate:"2025-04-29",attachments:[],createdAt:now},
    {id:2,name:"Dan Kowalski",phone:"848-555-0344",email:"dkowalski@outlook.com",boat:"2024 North Coast 265CE",budget:120000,tradeIn:"",salesperson:"Rob",status:"Warm",lastContactDate:"2025-04-14",lastContactType:"Text",notes:"Comparing dealers. Price sensitive.",followUpDate:"2025-04-28",attachments:[],createdAt:now},
    {id:3,name:"Steve Arlotta",phone:"732-555-0901",email:"",boat:"2025 Cape Horn 36T",budget:280000,tradeIn:"2021 Cape Horn 31T",salesperson:"Jake",status:"Hot",lastContactDate:"2025-04-25",lastContactType:"In Person",notes:"Ready to move fast. Needs BUC pull on trade.",followUpDate:"2025-04-29",attachments:[],createdAt:now}
  ];
  db.nextId = 4;
  writeDB(db);
}

seedIfEmpty();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// ─── LEADS ───────────────────────────────────────────────────────────────────

app.get('/api/leads', function(req, res) {
  const db = readDB();
  res.json((db.leads || []).slice().reverse());
});

app.post('/api/leads', function(req, res) {
  const db = readDB();
  if (!req.body.name) return res.status(400).json({ error: 'Name required' });
  const lead = Object.assign({}, req.body, {
    id: db.nextId++,
    attachments: req.body.attachments || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  db.leads.push(lead);
  writeDB(db);
  res.json(lead);
});

app.patch('/api/leads/:id', function(req, res) {
  const db = readDB();
  const id = parseInt(req.params.id);
  const idx = db.leads.findIndex(function(l) { return l.id === id; });
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.leads[idx] = Object.assign({}, db.leads[idx], req.body, { updatedAt: new Date().toISOString() });
  writeDB(db);
  res.json(db.leads[idx]);
});

app.put('/api/leads/:id', function(req, res) {
  const db = readDB();
  const id = parseInt(req.params.id);
  const idx = db.leads.findIndex(function(l) { return l.id === id; });
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.leads[idx] = Object.assign({}, db.leads[idx], req.body, {
    id: id,
    updatedAt: new Date().toISOString()
  });
  writeDB(db);
  res.json(db.leads[idx]);
});

app.delete('/api/leads/:id', function(req, res) {
  const db = readDB();
  const id = parseInt(req.params.id);
  db.leads = db.leads.filter(function(l) { return l.id !== id; });
  db.logs = (db.logs || []).filter(function(l) { return l.leadId !== id; });
  writeDB(db);
  res.json({ ok: true });
});

app.post('/api/leads/:id/log', function(req, res) {
  const db = readDB();
  const id = parseInt(req.params.id);
  if (!db.logs) db.logs = [];
  const entry = Object.assign({ id: Date.now(), leadId: id }, req.body, { loggedAt: new Date().toISOString() });
  db.logs.push(entry);
  const idx = db.leads.findIndex(function(l) { return l.id === id; });
  if (idx !== -1) {
    if (req.body.contactType) db.leads[idx].lastContactType = req.body.contactType;
    if (req.body.contactDate) db.leads[idx].lastContactDate = req.body.contactDate;
    if (req.body.notes && req.body.notes.trim()) db.leads[idx].notes = req.body.notes;
    db.leads[idx].updatedAt = new Date().toISOString();
  }
  writeDB(db);
  res.json(db.leads[idx] || {});
});

app.get('/api/leads/:id/log', function(req, res) {
  const db = readDB();
  const id = parseInt(req.params.id);
  const logs = (db.logs || []).filter(function(l) { return l.leadId === id; }).reverse();
  res.json(logs);
});

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────

app.get('/api/customers', function(req, res) {
  const db = readDB();
  res.json((db.customers || []).slice().reverse());
});

app.post('/api/customers', function(req, res) {
  const db = readDB();
  if (!db.customers) db.customers = [];
  if (!req.body.name) return res.status(400).json({ error: 'Name required' });
  const customer = Object.assign({}, req.body, {
    id: db.nextId++,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  db.customers.push(customer);
  writeDB(db);
  res.json(customer);
});

app.patch('/api/customers/:id', function(req, res) {
  const db = readDB();
  const id = parseInt(req.params.id);
  if (!db.customers) db.customers = [];
  const idx = db.customers.findIndex(function(c) { return c.id === id; });
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.customers[idx] = Object.assign({}, db.customers[idx], req.body, { updatedAt: new Date().toISOString() });
  writeDB(db);
  res.json(db.customers[idx]);
});

app.delete('/api/customers/:id', function(req, res) {
  const db = readDB();
  const id = parseInt(req.params.id);
  if (!db.customers) db.customers = [];
  db.customers = db.customers.filter(function(c) { return c.id !== id; });
  writeDB(db);
  res.json({ ok: true });
});

// ─── SCHEDULE / DETAILING BOARD ───────────────────────────────────────────────

app.get('/api/schedule', function(req, res) {
  const data = readScheduleDB();
  res.json(data);
});

app.post('/api/schedule/boats', function(req, res) {
  const data = readScheduleDB();
  const boat = Object.assign({}, req.body, {
    id: Date.now(),
    status: req.body.status || 'Not Done',
    flagged: false,
    addedAt: new Date().toISOString(),
    completedAt: null,
    history: []
  });
  data.boats.push(boat);
  writeScheduleDB(data);
  res.json(boat);
});

app.patch('/api/schedule/boats/:id', function(req, res) {
  const data = readScheduleDB();
  const id = parseInt(req.params.id);
  const idx = data.boats.findIndex(function(b) { return b.id === id; });
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const prev = data.boats[idx];
  const updated = Object.assign({}, prev, req.body, { updatedAt: new Date().toISOString() });

  // Track status changes in history
  if (req.body.status && req.body.status !== prev.status) {
    if (!updated.history) updated.history = [];
    updated.history.push({
      from: prev.status,
      to: req.body.status,
      at: new Date().toISOString(),
      by: req.body.updatedBy || 'Office'
    });
    if (req.body.status === 'Done') {
      updated.completedAt = new Date().toISOString();
      updated.flagged = false;
    }
  }

  data.boats[idx] = updated;
  writeScheduleDB(data);
  res.json(data.boats[idx]);
});

app.delete('/api/schedule/boats/:id', function(req, res) {
  const data = readScheduleDB();
  const id = parseInt(req.params.id);
  data.boats = data.boats.filter(function(b) { return b.id !== id; });
  writeScheduleDB(data);
  res.json({ ok: true });
});

// Daily rollover — flag anything Not Done from previous days
app.post('/api/schedule/rollover', function(req, res) {
  const data = readScheduleDB();
  const today = new Date().toDateString();

  let flaggedCount = 0;
  data.boats = data.boats.map(function(boat) {
    if (boat.status === 'Not Done' || boat.status === 'In Progress') {
      const addedDate = new Date(boat.scheduledDate || boat.addedAt).toDateString();
      if (addedDate !== today) {
        boat.flagged = true;
        flaggedCount++;
      }
    }
    return boat;
  });

  data.lastRollover = new Date().toISOString();
  writeScheduleDB(data);
  res.json({ ok: true, flagged: flaggedCount });
});

// Bulk import from sheet data
app.post('/api/schedule/import', function(req, res) {
  const data = readScheduleDB();
  const boats = req.body.boats || [];
  const now = new Date().toISOString();
  const today = new Date().toDateString();

  boats.forEach(function(b) {
    // Don't re-import if already exists (match by boat name + owner)
    const exists = data.boats.find(function(ex) {
      return ex.boatName === b.boatName && ex.owner === b.owner;
    });
    if (!exists) {
      data.boats.push(Object.assign({}, b, {
        id: Date.now() + Math.random(),
        status: b.status || 'Not Done',
        flagged: false,
        addedAt: now,
        scheduledDate: b.scheduledDate || today,
        completedAt: null,
        history: []
      }));
    }
  });

  writeScheduleDB(data);
  res.json({ ok: true, count: data.boats.length });
});

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, function() {
  console.log('Seaport CRM running on port ' + PORT);
  console.log('Data directory:', DATA_DIR);
});
