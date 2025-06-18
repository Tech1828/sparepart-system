const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./spareparts.db');

db.serialize(() => {
    // Tambah users
    db.run(`INSERT INTO users (name, username, password, role) VALUES 
        ('Ali', 'ali', '1234', 'technician'),
        ('Aminah', 'aminah', '1234', 'technician'),
        ('Siti', 'siti', '1234', 'salesgirl')
    `);

    // Tambah spareparts
    db.run(`INSERT INTO spareparts (name, price, in_stock) VALUES 
        ('LCD iPhone 11', 120.00, 10),
        ('Battery Samsung A12', 60.00, 15),
        ('Camera iPhone XR', 85.00, 8)
    `);

    console.log('✅ Data awal berjaya dimasukkan.');
});

db.close();
