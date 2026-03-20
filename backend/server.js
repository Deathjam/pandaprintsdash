const mqtt = require('mqtt');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');

const { PRINTER_IP, PRINTER_SERIAL, PRINTER_ACCESS_CODE, PORT = 3001, WS_PORT = 8080 } = process.env;

// Initialize SQLite
const db = new sqlite3.Database('./data/pandaprints.db');
db.on('error', (err) => console.error('SQLite DB error event:', err));
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS ams_state (
    id INTEGER PRIMARY KEY,
    tray_id INTEGER UNIQUE,
    color TEXT,
    type TEXT,
    grams_used REAL,
    grams_remaining REAL,
    rfid_detected INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Add columns for existing databases that may not have them.
  db.run("PRAGMA table_info(ams_state)", [], (err, rows) => {
    if (!err && rows && !rows.find(r => r.name === 'grams_remaining')) {
      db.run("ALTER TABLE ams_state ADD COLUMN grams_remaining REAL", (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column name')) {
          console.error('failed to add grams_remaining column:', alterErr);
        }
      });
    }
    if (!err && rows && !rows.find(r => r.name === 'rfid_detected')) {
      db.run("ALTER TABLE ams_state ADD COLUMN rfid_detected INTEGER DEFAULT 0", (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column name')) {
          console.error('failed to add rfid_detected column:', alterErr);
        }
      });
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS spool_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spool_id TEXT,
    name TEXT NOT NULL,
    brand TEXT,
    material TEXT,
    tray_id INTEGER,
    with_spool INTEGER,
    color TEXT,
    type TEXT,
    rfid TEXT,
    supplier TEXT,
    cost REAL,
    purchase_url TEXT,
    total_grams REAL,
    remaining_grams REAL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run("PRAGMA table_info(spool_inventory)", [], (err2, rows2) => {
    if (!err2 && rows2) {
      const existing = new Set(rows2.map((r) => r.name));
      const required = [
        { name: 'spool_id', type: 'TEXT' },
        { name: 'brand', type: 'TEXT' },
        { name: 'material', type: 'TEXT' },
        { name: 'tray_id', type: 'INTEGER' },
        { name: 'with_spool', type: 'INTEGER' },
        { name: 'color', type: 'TEXT' },
        { name: 'type', type: 'TEXT' },
        { name: 'rfid', type: 'TEXT' },
        { name: 'supplier', type: 'TEXT' },
        { name: 'cost', type: 'REAL' },
        { name: 'purchase_url', type: 'TEXT' },
        { name: 'total_grams', type: 'REAL' },
        { name: 'remaining_grams', type: 'REAL' }
      ];

      required.forEach((col) => {
        if (!existing.has(col.name)) {
          db.run(`ALTER TABLE spool_inventory ADD COLUMN ${col.name} ${col.type}`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column name')) {
              console.error(`failed to add ${col.name} column:`, alterErr);
            } else {
              console.log(`spool_inventory schema migration add ${col.name} complete`);
            }
          });
        }
      });
    }
  });
});

let dbReady = false;

const ensureAmsStateSchema = () => {
  db.all('PRAGMA table_info(ams_state)', [], (err, rows) => {
    if (err) {
      console.error('Failed to read ams_state schema:', err);
      return;
    }

    let needsGramsRemaining = !(rows && rows.find(r => r.name === 'grams_remaining'));
    let needsRfidDetected = !(rows && rows.find(r => r.name === 'rfid_detected'));

    if (!needsGramsRemaining && !needsRfidDetected) {
      dbReady = true;
      console.log('ams_state schema is up to date');
      return;
    }

    const finalizeSchema = () => {
      dbReady = true;
      console.log('ams_state schema migration complete');
    };

    const addNextColumn = () => {
      if (needsGramsRemaining) {
        needsGramsRemaining = false;
        db.run('ALTER TABLE ams_state ADD COLUMN grams_remaining REAL', (alterErr) => {
          if (alterErr && !alterErr.message.includes('duplicate column name')) {
            console.error('failed to add grams_remaining column:', alterErr);
          }
          addNextColumn();
        });
        return;
      }

      if (needsRfidDetected) {
        needsRfidDetected = false;
        db.run('ALTER TABLE ams_state ADD COLUMN rfid_detected INTEGER DEFAULT 0', (alterErr) => {
          if (alterErr && !alterErr.message.includes('duplicate column name')) {
            console.error('failed to add rfid_detected column:', alterErr);
          }
          addNextColumn();
        });
        return;
      }

      finalizeSchema();
    };

    addNextColumn();
  });
};

ensureAmsStateSchema();

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
  if (!dbReady) {
    return; // Wait for DB schema migration to complete
  }

  try {
    const payload = JSON.parse(message.toString());
    
    if (payload.print) {
      // Process Live AMS Hardware Data!
      if (payload.print.ams) {
        const amsData = payload.print.ams.ams[0].tray;
        
        amsData.forEach(tray => {
          // 'remain' is a percentage (90). 'tray_weight' is total grams (1000).
          const remainPct = tray.remain !== undefined ? parseFloat(tray.remain) : null;
          const weight = parseFloat(tray.tray_weight || 0);
          let gramsUsed = -1; // Default if no RFID data
          let gramsRemaining = null;

          const hasRfidData = remainPct !== null && !Number.isNaN(remainPct) && weight > 0;
          if (hasRfidData) {
            gramsRemaining = Math.max(0, weight * (remainPct / 100));
            gramsUsed = Math.max(0, weight - gramsRemaining);
          }

          const color = tray.tray_color || '#000000';
          const type = tray.tray_type || 'Empty';

          // If AMS report has no valid remaining info, preserve manual state to avoid overwriting user updates.
          // For no-RFID slots, assume 1000g total and preserve manual remaining.
          db.get('SELECT * FROM ams_state WHERE tray_id = ?', [tray.id], (selectErr, existing) => {
            if (selectErr) {
              console.error('AMS select error:', selectErr);
              return;
            }

            let effectiveGramsRemaining;
            let effectiveGramsUsed;
            let effectiveRfidDetected = hasRfidData ? 1 : 0;

            if (gramsRemaining === null || Number.isNaN(gramsRemaining)) {
              // No RFID data from AMS
              if (existing && existing.grams_remaining !== null && existing.grams_remaining !== undefined) {
                // User set remaining manually, keep it and calculate used
                effectiveGramsRemaining = existing.grams_remaining;
                effectiveGramsUsed = Math.max(0, 1000 - existing.grams_remaining);
              } else {
                // No manual data either, preserve whatever was there
                effectiveGramsRemaining = existing ? existing.grams_remaining : null;
                effectiveGramsUsed = existing ? existing.grams_used : -1;
              }
            } else {
              // AMS has RFID data, use it
              effectiveGramsRemaining = gramsRemaining;
              effectiveGramsUsed = gramsUsed;
            }

            db.run(`INSERT OR IGNORE INTO ams_state (tray_id, color, type, grams_used, grams_remaining, rfid_detected) VALUES (?, ?, ?, ?, ?, ?)`, 
              [tray.id, color, type, effectiveGramsUsed, effectiveGramsRemaining, effectiveRfidDetected], (insertErr) => {
                if (insertErr) console.error('AMS insert error:', insertErr);
              });

            db.run(`UPDATE ams_state SET color = ?, type = ?, grams_used = ?, grams_remaining = ?, rfid_detected = ?, last_updated = CURRENT_TIMESTAMP WHERE tray_id = ?`, 
              [color, type, effectiveGramsUsed, effectiveGramsRemaining, effectiveRfidDetected, tray.id], (updateErr) => {
                if (updateErr) console.error('AMS update error:', updateErr);
              });
          });
        });
        
        broadcastDbState();
      }
    }
  } catch (e) { 
    // Ignore malformed JSON 
  }
});

const app = express();
app.use(express.json());

// CORS support for frontend (http://localhost:3000) and other clients
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.post('/api/ams/:trayId/stock', (req, res) => {
  const trayId = parseInt(req.params.trayId, 10);
  if (Number.isNaN(trayId)) {
    return res.status(400).json({ error: 'trayId must be a number' });
  }

  const { grams_remaining, grams_used } = req.body;
  if (grams_remaining === undefined && grams_used === undefined) {
    return res.status(400).json({ error: 'grams_remaining or grams_used required' });
  }

  db.get('SELECT * FROM ams_state WHERE tray_id = ?', [trayId], (err, row) => {
    if (err) return res.status(500).json({ error: 'database error' });

    // If no RFID data exists, default total to 1000g
    const defaultTotal = 1000;
    const effectiveGramsRemaining = typeof grams_remaining === 'number' ? grams_remaining : (row ? row.grams_remaining : null);
    const effectiveGramsUsed = typeof grams_used === 'number' 
      ? grams_used 
      : (typeof grams_remaining === 'number' ? defaultTotal - grams_remaining : (row ? row.grams_used : -1));

    const values = {
      color: (row && row.color) || '#1e293b',
      type: (row && row.type) || 'Manual',
      grams_used: effectiveGramsUsed,
      grams_remaining: effectiveGramsRemaining,
      rfid_detected: (row && row.rfid_detected !== undefined && row.rfid_detected !== null) ? row.rfid_detected : 0,
    };

    if (row) {
      db.run(
        `UPDATE ams_state SET color = ?, type = ?, grams_used = ?, grams_remaining = ?, rfid_detected = ?, last_updated = CURRENT_TIMESTAMP WHERE tray_id = ?`,
        [values.color, values.type, values.grams_used, values.grams_remaining, values.rfid_detected, trayId],
        function (updateErr) {
          if (updateErr) return res.status(500).json({ error: 'update failed' });
          broadcastDbState();
          return res.json({ tray_id: trayId, ...values });
        }
      );
    } else {
      db.run(
        `INSERT INTO ams_state (tray_id, color, type, grams_used, grams_remaining, rfid_detected) VALUES (?, ?, ?, ?, ?, ?)`,
        [trayId, values.color, values.type, values.grams_used, values.grams_remaining, values.rfid_detected],
        function (insertErr) {
          if (insertErr) return res.status(500).json({ error: 'insert failed' });
          broadcastDbState();
          return res.json({ tray_id: trayId, ...values });
        }
      );
    }
  });
});

app.get('/api/spools', (req, res) => {
  db.all('SELECT * FROM spool_inventory ORDER BY last_updated DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'database error' });
    res.json(rows);
  });
});

app.get('/api/ams_state', (req, res) => {
  db.all('SELECT * FROM ams_state ORDER BY tray_id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'database error' });
    res.json(rows);
  });
});

app.post('/api/spools/fetch-url', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  const listMaterials = new Set(['PLA','PETG','ABS','TPU','NYLON','PC','ASA','PVA']);
  const productPath = (url.match(/\/products\/([^\/?#]+)/i) || [])[1] || '';
  const isBambuLab = /bambulab/i.test(url);
  const fallbackItemType = /refill/i.test(url) ? 'Refill' : 'Spool';
  const fallbackWithSpool = fallbackItemType === 'Spool' ? 1 : 0;
  const parts = productPath.split('-').map(p => p.trim()).filter(Boolean);

  const detectMaterialFromParts = (arr) => {
    for (const piece of arr) {
      if (listMaterials.has(piece.toUpperCase())) return piece.toUpperCase();
    }
    return null;
  };

  const cleanColorName = (raw) => raw
    .replace(/\(\d+\)/g, '')
    .replace(/\b(basic|filament|bambu|lab|printer|pack|spool|refill)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const toTitleCase = (str) => str
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  // Build a base response from URL alone (works even if fetch fails)
  const urlMaterial = detectMaterialFromParts(parts);
  const urlColorParts = parts.filter(p =>
    !listMaterials.has(p.toUpperCase()) &&
    !['spool','refill','basic','filament','true','silk','bambu','lab'].includes(p.toLowerCase())
  );
  const urlColor = urlColorParts.length > 0
    ? toTitleCase(cleanColorName(urlColorParts.join(' '))) || null
    : null;

  const baseResult = {
    name: productPath ? toTitleCase(productPath.replace(/-/g, ' ')) : 'Bambu Filament',
    brand: isBambuLab ? 'Bambu Lab' : null,
    material: urlMaterial,
    type: fallbackItemType,
    purchase_url: url,
    cost: null,
    color: urlColor,
    supplier: isBambuLab ? 'Bambu Lab' : null,
    rfid: isBambuLab ? 'Yes' : 'No',
    with_spool: isBambuLab ? fallbackWithSpool : 0,
    total_grams: isBambuLab ? 1000 : null,
    remaining_grams: isBambuLab ? 1000 : null
  };

  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) {
      // Page fetch failed but we can still return URL-derived data
      return res.json(baseResult);
    }
    const html = await response.text();

    const extractMeta = (field) => {
      const re = new RegExp(`<meta[^>]*name=["']${field}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
      const og = new RegExp(`<meta[^>]*property=["']og:${field}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
      const p1 = html.match(re);
      if (p1) return p1[1];
      const p2 = html.match(og);
      return p2 ? p2[1] : null;
    };

    const title = extractMeta('title') || extractMeta('name') || extractMeta('description') || null;
    let cost = null;
    const priceMatch = html.match(/"price"\s*:\s*"?([0-9]+\.?[0-9]*)"?/i);
    if (priceMatch) cost = parseFloat(priceMatch[1]);

    const titleParts = (title || '').split(/[^a-zA-Z0-9]+/).map(p => p.trim()).filter(Boolean);

    const detectMaterial = (arr) => {
      for (const piece of arr) {
        const candidate = piece.toUpperCase();
        if (listMaterials.has(candidate)) return candidate;
      }
      return null;
    };

    const stripHtml = (value) => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const findBambuColor = (htmlText) => {
      const cleanValue = (value) => {
        if (!value) return null;
        let v = stripHtml(value);
        if (!v) return null;
        if (/cookie settings?/i.test(v)) return null;
        if (/privacy/i.test(v)) return null;
        if (v.length > 80) return null; // safety limit, keep longer names allowed
        return v;
      };

      const candidates = [];
      const pushCandidate = (raw) => {
        const val = cleanValue(raw);
        if (val) candidates.push(val);
      };

      const appendMatches = (regex) => {
        let m;
        while ((m = regex.exec(htmlText)) !== null) {
          pushCandidate(m[1]);
        }
      };

      appendMatches(/<dt[^>]*>\s*(?:<[^>]+>\s*)*Color(?:\s*<[^>]+>\s*)*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gim);
      appendMatches(/<th[^>]*>\s*(?:<[^>]+>\s*)*Color(?:\s*<[^>]+>\s*)*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gim);
      appendMatches(/<label[^>]*>\s*(?:<[^>]+>\s*)*Color(?:\s*<[^>]+>\s*)*<\/label>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/gim);
      appendMatches(/\bColor\s*[:\-]\s*([^<\n\r]+)/gim);

      if (candidates.length === 0) {
        // scan all dt/dd pairs for a dt containing Color
        const dtdd = [...htmlText.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gim)];
        for (const [, dt, dd] of dtdd) {
          if (/color/i.test(stripHtml(dt))) {
            pushCandidate(dd);
            if (candidates.length) break;
          }
        }
      }

      return candidates.length > 0 ? stripHtml(candidates[0]) : null;
    };

    // Try Shopify product JSON API first (Bambu store is Shopify; color is JS-rendered in HTML)
    let shopifyColor = null;
    if (productPath) {
      try {
        const parsedUrl = new URL(url);
        const jsonUrl = `${parsedUrl.origin}/products/${productPath}.json`;
        const jsonRes = await fetch(jsonUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (jsonRes.ok) {
          const productJson = await jsonRes.json();
          const product = productJson && productJson.product;
          if (product) {
            const colorOpt = (product.options || []).find(o => /color/i.test(o.name));
            if (colorOpt) {
              const colorPos = colorOpt.position;
              const variantId = (url.match(/[?&]variant=(\d+)/i) || [])[1];
              let variant = variantId
                ? (product.variants || []).find(v => String(v.id) === variantId)
                : null;
              if (!variant && product.variants && product.variants.length > 0) {
                variant = product.variants[0];
              }
              if (variant) shopifyColor = variant[`option${colorPos}`] || null;
            }
            // Fill in price from variant if not already found in HTML
            if (!cost && product.variants && product.variants.length > 0) {
              const variantId2 = (url.match(/[?&]variant=(\d+)/i) || [])[1];
              const pv = variantId2
                ? (product.variants || []).find(v => String(v.id) === variantId2)
                : product.variants[0];
              if (pv) cost = parseFloat(pv.price) || null;
            }
          }
        }
      } catch (e) { /* Shopify JSON unavailable, fall through to HTML parsing */ }
    }

    // Bambu storefront embeds selected SKU data in Next.js script payloads.
    // If URL has ?id=<sku>, pull color/price from that block.
    let bambuEmbeddedColor = null;
    let bambuEmbeddedType = null;
    const selectedSkuId = (url.match(/[?&](?:id|variant)=(\d+)/i) || [])[1] || null;
    const normalizedHtml = html.replace(/\\"/g, '"');
    if (selectedSkuId) {
      const blockRe = new RegExp(`"id":"${selectedSkuId}"[\\s\\S]{0,4000}?"productSkuPropertyList":\\[(.*?)\\]`, 'i');
      const block = normalizedHtml.match(blockRe);
      if (block && block[1]) {
        const colorMatch = block[1].match(/"propertyKey":"Color"[\s\S]{0,250}?"propertyValue":"([^"]+)"/i);
        if (colorMatch) bambuEmbeddedColor = colorMatch[1];

        const typeMatch = block[1].match(/"propertyKey":"Type"[\s\S]{0,250}?"propertyValue":"([^"]+)"/i);
        if (typeMatch) bambuEmbeddedType = typeMatch[1];
      }
      const priceRe = new RegExp(`"id":"${selectedSkuId}"[\\s\\S]{0,600}?"price":([0-9]+(?:\\.[0-9]+)?)`, 'i');
      const priceBlock = normalizedHtml.match(priceRe);
      if (priceBlock) cost = parseFloat(priceBlock[1]) || null;
    }

    const colorField = bambuEmbeddedColor || shopifyColor || findBambuColor(html);
    let colorName = colorField ? String(colorField).trim() : null;

    if (!colorName) {
      if (parts.length > 0) {
        const targets = parts
          .filter(part => !listMaterials.has(part.toUpperCase()) && !['spool','refill','basic','filament','true','silk','bambu','lab'].includes(part.toLowerCase()));
        colorName = targets.length > 0 ? targets.join(' ') : null;
      }
    }

    if (!colorName && title) {
      const titleCandidates = title.split(/[^a-zA-Z0-9]+/).filter(Boolean).map(p => p.trim());
      const pageParts = titleCandidates.filter(part => !listMaterials.has(part.toUpperCase()) && !['bambu','filament','spool','refill','basic','true','silk','pla','petg','abs','tpu','nylon','pc','asa','pva'].includes(part.toLowerCase()));
      if (pageParts.length > 0) colorName = pageParts.slice(0, 3).join(' ');
    }

    const cleanColorName = (raw) => raw
      .replace(/\(\d+\)/g, '')                                                   // strip numeric codes like (10100)
      .replace(/\b(basic|filament|bambu|lab|printer|pack|spool|refill)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (colorName) colorName = cleanColorName(colorName);
    if (!colorName || colorName.length < 2) colorName = null;

    if (colorName) colorName = toTitleCase(colorName);

    let itemType = fallbackItemType;
    let withSpool = fallbackWithSpool;
    if (bambuEmbeddedType) {
      const normalizedType = String(bambuEmbeddedType).trim().toLowerCase();
      if (normalizedType === 'refill') {
        itemType = 'Refill';
        withSpool = 0;
      } else if (normalizedType === 'filament with spool') {
        itemType = 'Spool';
        withSpool = 1;
      }
    }

    let materialType = detectMaterial(parts) || detectMaterial(titleParts);
    if (!materialType) {
      const maybeFromMeta = extractMeta('material');
      if (maybeFromMeta) {
        const candidate = maybeFromMeta.trim().toUpperCase();
        if (listMaterials.has(candidate)) materialType = candidate;
      }
    }

    res.json({
      name: title || (productPath ? toTitleCase(productPath.replace(/-/g, ' ')) : 'Bambu Filament'),
      brand: isBambuLab ? 'Bambu Lab' : null,
      material: materialType || urlMaterial,
      type: itemType,
      purchase_url: url,
      cost,
      color: colorName || null,
      supplier: isBambuLab ? 'Bambu Lab' : null,
      rfid: isBambuLab ? 'Yes' : 'No',
      with_spool: isBambuLab ? withSpool : 0,
      total_grams: isBambuLab ? 1000 : null,
      remaining_grams: isBambuLab ? 1000 : null
    });
  } catch (err) {
    // Network error — still return URL-derived data rather than failing completely
    return res.json(baseResult);
  }
});

app.post('/api/spools', (req, res) => {
  console.log('POST /api/spools body:', JSON.stringify(req.body));
  const {
    spool_id,
    name,
    brand,
    material,
    tray_id,
    with_spool,
    color,
    type,
    rfid,
    supplier,
    cost,
    purchase_url,
    total_grams,
    remaining_grams
  } = req.body;

  const finalName = (name && typeof name === 'string' && name.trim())
    ? name.trim()
    : (brand && typeof brand === 'string' ? brand.trim() : (material && typeof material === 'string' ? material.trim() : (spool_id ? `Spool ${spool_id}` : 'Unnamed spool')));

  if (!finalName) {
    return res.status(400).json({ error: 'name is required' });
  }

  const effectiveTotalGrams = (total_grams !== undefined && total_grams !== null && !Number.isNaN(total_grams)) ? total_grams : 1000;

  db.run(
    `INSERT INTO spool_inventory (spool_id, name, brand, material, tray_id, with_spool, color, type, rfid, supplier, cost, purchase_url, total_grams, remaining_grams) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      spool_id ?? null,
      finalName,
      brand ?? null,
      material ?? null,
      tray_id ?? null,
      with_spool ? 1 : 0,
      color ?? null,
      type ?? null,
      rfid ?? null,
      supplier ?? null,
      cost ?? null,
      purchase_url ?? null,
      effectiveTotalGrams,
      remaining_grams ?? null
    ],
    function (err) {
      if (err) {
        console.error('spool insert error', err);
        return res.status(500).json({ error: 'database error', details: err.message });
      }
      db.get('SELECT * FROM spool_inventory WHERE id = ?', [this.lastID], (err2, row) => {
        if (err2) {
          console.error('spool select after insert error', err2);
          return res.status(500).json({ error: 'database error', details: err2.message });
        }
        res.status(201).json(row);
      });
    }
  );
});

app.put('/api/spools/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });

  const updatable = ['spool_id','name','brand','material','tray_id','with_spool','color','type','rfid','supplier','cost','purchase_url','total_grams','remaining_grams'];
  const values = [];
  const setClauses = [];

  updatable.forEach((key) => {
    if (req.body[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(req.body[key]);
    }
  });

  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'no fields to update' });
  }

  values.push(id);
  db.run(`UPDATE spool_inventory SET ${setClauses.join(', ')} WHERE id = ?`, values, function (err) {
    if (err) {
      console.error('spool update error', err);
      return res.status(500).json({ error: 'database error', details: err.message });
    }
    if (this.changes === 0) return res.status(404).json({ error: 'not found' });

    db.get('SELECT * FROM spool_inventory WHERE id = ?', [id], (err2, row) => {
      if (err2) {
        console.error('spool select after update error', err2);
        return res.status(500).json({ error: 'database error', details: err2.message });
      }
      res.json(row);
    });
  });
});

app.delete('/api/spools/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });

  db.run('DELETE FROM spool_inventory WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'database error' });
    if (this.changes === 0) return res.status(404).json({ error: 'not found' });
    res.json({ deleted: true });
  });
});

app.listen(PORT, () => console.log(`Backend HTTP running on port ${PORT}`));