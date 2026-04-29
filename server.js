const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_PATH || '/data/crm.db.json';

function readDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch(e) {}
  return { leads: [], logs: [], nextId: 1 };
}

function writeDB(data) {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function seedIfEmpty() {
  const db = readDB();
  if (db.leads.length > 0) return;
  const now = new Date().toISOString();
  db.leads = [
    {id:1,name:"Mike Torrella",phone:"732-555-0182",email:"mtorrella@gmail.com",boat:"2025 Cape Horn 28XS",budget:145000,tradeIn:"2019 Grady-White 257",salesperson:"Jake",status:"Hot",lastContactDate:"2025-04-21",lastContactType:"Call",notes:"Very interested. Financing pre-approved.",followUpDate:"2025-04-29",attachments:[],createdAt:now},
    {id:2,name:"Dan Kowalski",phone:"848-555-0344",email:"dkowalski@outlook.com",boat:"2024 North Coast 265CE",budget:120000,tradeIn:"",salesperson:"Rob",status:"Warm",lastContactDate:"2025-04-14",lastContactType:"Text",notes:"Comparing dealers. Price sensitive.",followUpDate:"2025-04-28",attachments:[],createdAt:now},
    {id:3,name:"Steve Arlotta",phone:"732-555-0901",email:"",boat:"2025 Cape Horn 36T",budget:280000,tradeIn:"2021 Cape Horn 31T",salesperson:"Jake",status:"Hot",lastContactDate:"2025-04-25",lastContactType:"In Person",notes:"Ready to move fast. Needs BUC pull on trade.",followUpDate:"2025-04-29",attachments:[],createdAt:now},
    {id:4,name:"Chris Fabian",phone:"609-555-0238",email:"cfabian@icloud.com",boat:"2025 North Coast 245",budget:88000,tradeIn:"",salesperson:"Rob",status:"Warm",lastContactDate:"2025-04-18",lastContactType:"Call",notes:"First time buyer. Needs warranty info.",followUpDate:"2025-04-30",attachments:[],createdAt:now},
    {id:5,name:"Joe Santangelo",phone:"732-555-0754",email:"",boat:"2025 Cape Horn 24OS",budget:72000,tradeIn:"2017 Mako 214",salesperson:"Jake",status:"Warm",lastContactDate:"2025-04-20",lastContactType:"Text",notes:"Has Mako trade. Waiting on insurance quote.",followUpDate:"2025-05-02",attachments:[],createdAt:now}
  ];
  db.nextId = 6;
  writeDB(db);
}

seedIfEmpty();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/leads', function(req, res) {
  const db = readDB();
  res.json(db.leads.slice().reverse());
});

app.post('/api/leads', function(req, res) {
  const db = readDB();
  if (!req.body.name) return res.status(400).json({ error: 'Name required' });
  const lead = Object.assign({}, req.body, {
    id: db.nextId++,
    attachments: [],
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
    db.leads[idx].lastContactType = req.body.contactType;
    db.leads[idx].lastContactDate = req.body.contactDate;
    if (req.body.notes && req.body.notes.trim()) {
      db.leads[idx].notes = req.body.notes;
    }
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

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, function() {
  console.log('Seaport CRM running on port ' + PORT);
});
