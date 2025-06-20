const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./spareparts.db');

db.get("SELECT * FROM users WHERE role = 'admin'", (err, row) => {
  if (err) {
    console.error("❌ Error:", err.message);
  } else {
    console.log("✅ Data Admin Ditemui:\n", row);
  }

  db.close();
});
