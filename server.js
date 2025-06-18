const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// ✅ Sambung ke database SQLite
const db = new sqlite3.Database('./spareparts.db', (err) => {
  if (err) return console.error(err.message);
  console.log('✅ Disambung ke database SQLite.');
});

// ✅ Cipta jadual jika belum wujud
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT,
    position TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS spareparts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price REAL,
    in_stock INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    sparepart_id INTEGER,
    receipt_no TEXT,
    used_date TEXT,
    tujuan TEXT,
    payment_status TEXT,
    restock_status TEXT,
    update_status TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS restock_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sparepart_id INTEGER,
    user_id INTEGER,
    qty INTEGER,
    restock_date TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS permintaan_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model TEXT,
    note TEXT,
    user_id INTEGER,
    created_at TEXT
  )`);
});

// ✅ API root
app.get('/', (req, res) => {
  res.send('Sparepart System Backend is running!');
});

// ✅ API login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, row) => {
    if (err) return res.json({ success: false, message: "DB Error" });
    if (row) {
      res.json({
        success: true,
        role: row.role,
        position: row.position,
        username: row.username,
        user_id: row.id,
        name: row.name
      });
    } else {
      res.json({ success: false, message: "Invalid credentials" });
    }
  });
});

// ✅ API Tukar Kata Laluan (staff)
app.post('/tukar-password', (req, res) => {
  const { username, oldPassword, newPassword } = req.body;
  if (!username || !oldPassword || !newPassword) return res.json({ success: false });

  db.get(`SELECT * FROM users WHERE username = ? AND password = ? AND role = 'staff'`,
    [username, oldPassword], (err, row) => {
      if (!row) return res.json({ success: false, message: "Kata laluan lama salah." });

      db.run(`UPDATE users SET password = ? WHERE username = ?`, [newPassword, username], (err2) => {
        if (err2) return res.json({ success: false, message: "Gagal tukar kata laluan." });
        res.json({ success: true, message: "Berjaya tukar kata laluan!" });
      });
    });
});

// ✅ API Tambah User Staff
app.post('/tambah-user', (req, res) => {
  const { name, username, password, position } = req.body;
  if (!name || !username || !password || !position)
    return res.status(400).json({ success: false, message: "Sila isi semua maklumat." });

  db.run(`INSERT INTO users (name, username, password, role, position) VALUES (?, ?, ?, 'staff', ?)`,
    [name, username, password, position],
    (err) => {
      if (err) return res.json({ success: false, message: "Username telah digunakan." });
      res.json({ success: true });
    });
});

// ✅ API Senarai User Staff
app.get('/senarai-user', (req, res) => {
  db.all(`SELECT id, name, username, position FROM users WHERE role = 'staff' ORDER BY name ASC`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ✅ API Padam User Staff
app.post('/padam-user', (req, res) => {
  const { id } = req.body;
  if (!id) return res.json({ success: false });
  db.run(`DELETE FROM users WHERE id = ? AND role = 'staff'`, [id], (err) => {
    if (err) return res.json({ success: false });
    res.json({ success: true });
  });
});

// ✅ API Reset Password oleh Admin
app.post('/reset-password', (req, res) => {
  const { id, newPassword } = req.body;
  if (!id || !newPassword) return res.status(400).json({ success: false });

  db.run(`UPDATE users SET password = ? WHERE id = ? AND role = 'staff'`, [newPassword, id], (err) => {
    if (err) return res.json({ success: false });
    res.json({ success: true });
  });
});

// ✅ API Sparepart
app.get('/spareparts', (req, res) => {
  db.all(`SELECT * FROM spareparts`, (err, rows) => {
    if (err) return res.status(500).json({ error: err });
    res.json(rows);
  });
});

app.post('/spareparts', (req, res) => {
  const { name, price, stock } = req.body;
  if (!name || !price) return res.status(400).json({ success: false });

  db.run(`INSERT INTO spareparts (name, price, in_stock) VALUES (?, ?, ?)`,
    [name, price, stock || 0], (err) => {
      if (err) return res.status(500).json({ success: false });
      res.json({ success: true });
    });
});

// ✅ API Penggunaan Sparepart
app.post('/penggunaan', (req, res) => {
  const { sparepart_id, no_resit, tarikh, tujuan } = req.body;
  if (!sparepart_id || !no_resit || !tarikh || !tujuan) return res.json({ success: false });

  db.get(`SELECT in_stock FROM spareparts WHERE id = ?`, [sparepart_id], (err, row) => {
    if (!row || row.in_stock <= 0) return res.json({ success: false, message: "Stok habis!" });

    db.run(`INSERT INTO usage_log (sparepart_id, receipt_no, used_date, tujuan, payment_status, restock_status, update_status)
            VALUES (?, ?, ?, ?, 'belum bayar', 'belum restock', 'belum update')`,
      [sparepart_id, no_resit, tarikh, tujuan], (err2) => {
        if (err2) return res.json({ success: false });

        db.run(`UPDATE spareparts SET in_stock = in_stock - 1 WHERE id = ?`, [sparepart_id], (err3) => {
          if (err3) return res.json({ success: false });
          res.json({ success: true });
        });
      });
  });
});

app.get('/penggunaan', (req, res) => {
  const query = `
    SELECT usage_log.used_date, usage_log.receipt_no, usage_log.tujuan,
           spareparts.name, spareparts.price
    FROM usage_log
    JOIN spareparts ON usage_log.sparepart_id = spareparts.id
    ORDER BY usage_log.used_date DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ✅ API Admin: Paparan penuh penggunaan
app.get('/penggunaan-penuh', (req, res) => {
  const { nama, from, to, resit } = req.query;
  let query = `
    SELECT usage_log.id, usage_log.used_date, usage_log.receipt_no, usage_log.tujuan,
           usage_log.payment_status, usage_log.restock_status, usage_log.update_status,
           spareparts.name, spareparts.price
    FROM usage_log
    JOIN spareparts ON usage_log.sparepart_id = spareparts.id
    WHERE 1=1
  `;
  const params = [];
  if (nama) { query += " AND spareparts.name LIKE ?"; params.push(`%${nama}%`); }
  if (resit) { query += " AND usage_log.receipt_no LIKE ?"; params.push(`%${resit}%`); }
  if (from) { query += " AND usage_log.used_date >= ?"; params.push(from); }
  if (to) { query += " AND usage_log.used_date <= ?"; params.push(to); }

  query += " ORDER BY usage_log.used_date DESC";

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ✅ API Admin: Kemaskini status
app.post('/kemaskini-status', (req, res) => {
  const { id, payment, restock, update } = req.body;
  db.run(`UPDATE usage_log SET payment_status = ?, restock_status = ?, update_status = ? WHERE id = ?`,
    [payment, restock, update, id], (err) => {
      if (err) return res.json({ success: false });
      res.json({ success: true });
    });
});

// ✅ API Restock + log
app.post('/restock', (req, res) => {
  const { id, qty, user_id } = req.body;
  if (!id || !qty || qty <= 0 || !user_id) return res.status(400).json({ success: false });

  db.run(`UPDATE spareparts SET in_stock = in_stock + ? WHERE id = ?`, [qty, id], (err) => {
    if (err) return res.json({ success: false });

    const today = new Date().toISOString().split("T")[0];
    db.run(`INSERT INTO restock_log (sparepart_id, user_id, qty, restock_date) VALUES (?, ?, ?, ?)`,
      [id, user_id, qty, today], (err2) => {
        if (err2) return res.json({ success: false });
        res.json({ success: true });
      });
  });
});

// ✅ API Log Restock
app.get('/log-restock', (req, res) => {
  const query = `
    SELECT restock_log.*, spareparts.name AS sparepart_name, users.name AS user_name
    FROM restock_log
    JOIN spareparts ON restock_log.sparepart_id = spareparts.id
    JOIN users ON restock_log.user_id = users.id
    ORDER BY restock_log.restock_date DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ✅ API Simpan Permintaan Sparepart
app.post('/permintaan', (req, res) => {
  const { model, note, user_id } = req.body;
  if (!model || !user_id) return res.status(400).json({ success: false });

  const today = new Date().toISOString().split("T")[0];
  db.run(`INSERT INTO permintaan_log (model, note, user_id, created_at) VALUES (?, ?, ?, ?)`,
    [model, note || '', user_id, today], (err) => {
      if (err) return res.json({ success: false });
      res.json({ success: true });
    });
});

// ✅ API Ambil Semua Permintaan
app.get('/permintaan', (req, res) => {
  const query = `
    SELECT permintaan_log.*, users.name AS user_name
    FROM permintaan_log
    JOIN users ON permintaan_log.user_id = users.id
    ORDER BY created_at DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ✅ API Statistik Permintaan (Graf)
app.get('/graf-permintaan', (req, res) => {
  const query = `
    SELECT model, COUNT(*) AS jumlah
    FROM permintaan_log
    GROUP BY model
    ORDER BY jumlah DESC
    LIMIT 10
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ✅ API Statistik Penggunaan Sparepart
app.get('/graf-penggunaan', (req, res) => {
  const { bulan } = req.query;

  let query = `
    SELECT spareparts.name, COUNT(*) AS jumlah
    FROM usage_log
    JOIN spareparts ON usage_log.sparepart_id = spareparts.id
    WHERE 1=1
  `;
  const params = [];
  if (bulan) {
    query += " AND strftime('%Y-%m', usage_log.used_date) = ?";
    params.push(bulan);
  }

  query += " GROUP BY spareparts.name ORDER BY jumlah DESC";

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ✅ API Laporan Bayaran
app.get('/laporan-bayaran', (req, res) => {
  const { from, to } = req.query;

  let query = `
    SELECT 
      SUM(CASE WHEN payment_status = 'sudah bayar' THEN spareparts.price ELSE 0 END) AS sudah_bayar,
      SUM(CASE WHEN payment_status = 'belum bayar' THEN spareparts.price ELSE 0 END) AS belum_bayar,
      SUM(spareparts.price) AS jumlah_keseluruhan
    FROM usage_log
    JOIN spareparts ON usage_log.sparepart_id = spareparts.id
    WHERE 1=1
  `;
  const params = [];
  if (from) { query += " AND used_date >= ?"; params.push(from); }
  if (to) { query += " AND used_date <= ?"; params.push(to); }

  db.get(query, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});

// ✅ Mula server
app.listen(PORT, () => {
  console.log(`🚀 Server bermula di http://localhost:${PORT}`);
});
