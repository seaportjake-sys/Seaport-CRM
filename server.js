const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Pure-JS JSON file database (no native compile needed) ──────────────────
const DB_FILE = process.env.DB_PATH || '/data/crm.db.json';

function readDB() {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch(e) {}
  return { leads: [], logs: [], nextId: 1 };
}

function writeDB(data) {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function seedIfEmpty() {
  const db = readDB();
  if (db.leads.length > 0) return;
  db.leads = [
    {id:1,name:"Mike Torrella",phone:"732-555-0182",email:"mtorrella@gmail.com",boat:"2025 Cape Horn 28XS",budget:145000,tradeIn:"2019 Grady-White 257",salesperson:"Jake",status:"Hot",lastContactDate:"2025-04-21",lastContactType:"Call",notes:"Very interested, wants to see the boat rigged out. Financing pre-approved.",followUpDate:"2025-04-29",attachments:[],createdAt:new Date().toISOString()},
    {id:2,name:"Dan Kowalski",phone:"848-555-0344",email:"dkowalski@outlook.com",boat:"2024 North Coast 265CE",budget:120000,tradeIn:"",salesperson:"Rob",status:"Warm",lastContactDate:"2025-04-14",lastContactType:"Text",notes:"Comparing us to another dealer. Price sensitive. Wants full canvas package.",followUpDate:"2025-04-28",attachments:[],createdAt:new Date().toISOString()},
    {id:3,name:"Steve Arlotta",phone:"732-555-0901",email:"",boat:"2025 Cape Horn 36T",budget:280000,tradeIn:"2021 Cape Horn 31T",salesperson:"Jake",status:"Hot",lastContactDate:"2025-04-25",lastContactType:"In Person",notes:"Came in Saturday, loves the 36T. Trade-in still needs BUC pull. Ready to move fast.",followUpDate:"2025-04-29",attachments:[],createdAt:new Date().toISOString()},
    {id:4,name:"Tom Rigney",phone:"201-555-0467",email:"trigney@gmail.com",boat:"Used 2022 Cape Horn 27XS",budget:95000,tradeIn:"",salesperson:"Theo",status:"Dead",lastContactDate:"2025-03-28",lastContactType:"Email",notes:"Inquired online. Never answered follow-up calls. May have bought elsewhere.",followUpDate:"",attachments:[],createdAt:new Date().toISOString()},
    {id:5,name:"Chris Fabian",phone:"609-555-0238",email:"cfabian@icloud.com",boat:"2025 North Coast 245",budget:88000,tradeIn:"",salesperson:"Rob",status:"Warm",lastContactDate:"2025-04-18",lastContactType:"Call",notes:"First-time buyer. Nervous about financing. Needs more info on warranty.",followUpDate:"2025-04-30",attachments:[],createdAt:new Date().toISOString()},
    {id:6,name:"Joe Santangelo",phone:"732-555-0754",email:"",boat:"2025 Cape Horn 24OS",budget:72000,tradeIn:"2017 Mako 214",salesperson:"Jake",status:"Warm",lastContactDate:"2025-04-20",lastContactType:"Text",notes:"Has a Mako trade. Waiting on insurance quote. Wants Yamaha 200.",followUpDate:"2025-05-02",attachments:[],createdAt:new Date().toISOString()},
    {id:7,name:"Paul Demarest",phone:"917-555-0122",email:"pdemarest@gmail.com",boat:"2024 Cape Horn 28XS",budget:138000,tradeIn:"",salesperson:"Rob",status:"Dead",lastContactDate:"2025-03-10",lastContactType:"Call",notes:"Went with another dealer. Price could not be matched.",followUpDate:"",attachments:[],createdAt:new Date().toISOString()},
  ];
  db.nextId = 8;
  writeDB(db);
}

seedIfEmpty();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// GET all leads
app.get('/api/leads', (req, res) => {
  const db = readDB();
  res.json(db.leads.slice().reverse());
});

// POST new lead
app.post('/api/leads', (req, res) => {
  const db = readDB();
  const lead = { ...req.body, id: db.nextId++, attachments: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  if (!lead.name) return res.status(400).json({ error: 'Name required' });
  db.leads.push(lead);
  writeDB(db);
  res.json(lead);
});

// PATCH lead
app.patch('/api/leads/:id', (req, res) => {
  const db = readDB();
  const id = parseInt(req.params.id);
  const idx = db.leads.findIndex(l => l.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.leads[idx] = { ...db.leads[idx], ...req.body, updatedAt: new Date().toISOString() };
  writeDB(db);
  res.json(db.leads[idx]);
});

// DELETE lead
app.delete('/api/leads/:id', (req, res) => {
  const db = readDB();
  const id = parseInt(req.params.id);
  db.leads = db.leads.filter(l => l.id !== id);
  db.logs  = (db.logs||[]).filter(l => l.leadId !== id);
  writeDB(db);
  res.json({ ok: true });
});

// POST contact log
app.post('/api/leads/:id/log', (req, res) => {
  const db = readDB();
  const id = parseInt(req.params.id);
  const entry = { id: Date.now(), leadId: id, ...req.body, loggedAt: new Date().toISOString() };
  if (!db.logs) db.logs = [];
  db.logs.push(entry);
  // update lead last contact
  const idx = db.leads.findIndex(l => l.id === id);
  if (idx !== -1) {
    db.leads[idx].lastContactType = req.body.contactType;
    db.leads[idx].lastContactDate = req.body.contactDate;
    if (req.body.notes && req.body.notes.trim()) db.leads[idx].notes = req.body.notes;
    db.leads[idx].updatedAt = new Date().toISOString();
  }
  writeDB(db);
  res.json(db.leads[idx] || {});
});

// GET contact log
app.get('/api/leads/:id/log', (req, res) => {
  const db = readDB();
  const id = parseInt(req.params.id);
  const logs = (db.logs||[]).filter(l => l.leadId === id).reverse();
  res.json(logs);
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Seaport CRM running on port ${PORT}`));
