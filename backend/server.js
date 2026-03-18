const mqtt = require('mqtt');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');

const { PRINTER_IP, PRINTER_SERIAL, PRINTER_ACCESS_CODE, PORT = 3001, WS_PORT = 8080 } = process.env;

// Initialize SQLite
const db = new sqlite3.Database('./data/pandaprints.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS ams_state (
    id INTEGER PRIMARY KEY, tray_id INTEGER UNIQUE, color TEXT, type TEXT, grams_used REAL, last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Initialize WebSockets
const wss = new WebSocket.Server({ port: WS_PORT });
let clients = [];

wss.on('connection', (ws) => {
  clients.push(ws);
  db.all('SELECT * FROM ams_state', [], (err, rows) => {
    if (!err) ws.send(JSON.stringify({ type: 'INIT', data: rows }));
  });
  ws.on('close', () => clients = clients.filter(c => c !== ws));
});

const broadcastDbState = () => {
  db.all('SELECT * FROM ams_state', [], (err, rows) => {
    if (!err) clients.forEach(client => client.send(JSON.stringify({ type: 'UPDATE', data: rows })));
  });
};

// --- MQTT Logic ---
const mqttClient = mqtt.connect(`mqtts://${PRINTER_IP}:8883`, {
  username: 'bblp', password: PRINTER_ACCESS_CODE, rejectUnauthorized: false
});

mqttClient.on('connect', () => {
  console.log('Connected to Bambu Printer MQTT');
  mqttClient.subscribe(`device/${PRINTER_SERIAL}/report`);
  
  // Ask the printer to immediately dump its entire state on startup
  const pushAllPayload = { pushing: { sequence_id: "1", command: "pushall" } };
  mqttClient.publish(`device/${PRINTER_SERIAL}/request`, JSON.stringify(pushAllPayload));
  console.log('Requested full state from printer...');
});

mqttClient.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    
    if (payload.print) {
      // Process Live AMS Hardware Data!
      if (payload.print.ams) {
        const amsData = payload.print.ams.ams[0].tray;
        
        amsData.forEach(tray => {
          // 'remain' is a percentage (90). 'tray_weight' is total grams (1000).
          let remain = parseInt(tray.remain);
          let weight = parseFloat(tray.tray_weight || 0);
          let gramsUsed = -1; // Default to -1 for 3rd party spools

          // If it's a Bambu RFID spool, calculate the exact grams used!
          if (remain >= 0 && weight > 0) {
            gramsUsed = weight - (weight * (remain / 100));
          }

          db.run(`INSERT OR IGNORE INTO ams_state (tray_id, color, type, grams_used) VALUES (?, ?, ?, ?)`, 
                 [tray.id, tray.tray_color || '#000000', tray.tray_type || 'Empty', gramsUsed]);
          
          db.run(`UPDATE ams_state SET color = ?, type = ?, grams_used = ? WHERE tray_id = ?`, 
                 [tray.tray_color || '#000000', tray.tray_type || 'Empty', gramsUsed, tray.id]);
        });
        
        broadcastDbState();
      }
    }
  } catch (e) { 
    // Ignore malformed JSON 
  }
});

const app = express();
app.listen(PORT, () => console.log(`Backend HTTP running on port ${PORT}`));