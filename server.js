const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ealntchcckxuhrrefiae.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhbG50Y2hjY2t4dWhycmVmaWFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzMTEwMDYsImV4cCI6MjA2NTg4NzAwNn0.-cmbcuMZefeQGTCBK-R0WzbRqw4lqdjgaMryT0uIxlw'
);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// ✅ Root
app.get('/', (req, res) => {
  res.send('✅ Backend Sparepart System (Supabase)');
});

// ✅ Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const { data, error } = await supabase
    .from('users')
    .select()
    .eq('username', username)
    .eq('password', password)
    .single();

  if (error || !data) return res.json({ success: false, message: "Login gagal" });

  res.json({
    success: true,
    role: data.role,
    position: data.position,
    username: data.username,
    user_id: data.id,
    name: data.name
  });
});

// ✅ Tukar Password
app.post('/tukar-password', async (req, res) => {
  const { username, oldPassword, newPassword } = req.body;
  const { data, error } = await supabase
    .from('users')
    .select()
    .eq('username', username)
    .eq('password', oldPassword)
    .eq('role', 'staff')
    .single();

  if (error || !data) return res.json({ success: false });

  const update = await supabase
    .from('users')
    .update({ password: newPassword })
    .eq('username', username);

  res.json({ success: !update.error });
});

// ✅ Tambah Staff
app.post('/tambah-user', async (req, res) => {
  const { name, username, password, position } = req.body;
  const { error } = await supabase.from('users').insert([
    { name, username, password, position, role: 'staff' }
  ]);
  res.json({ success: !error });
});

// ✅ Senarai Staff
app.get('/senarai-user', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, username, position')
    .eq('role', 'staff')
    .order('name');
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// ✅ Padam Staff
app.post('/padam-user', async (req, res) => {
  const { id } = req.body;
  const { error } = await supabase.from('users').delete().eq('id', id).eq('role', 'staff');
  res.json({ success: !error });
});

// ✅ Reset Password
app.post('/reset-password', async (req, res) => {
  const { id, newPassword } = req.body;
  const { error } = await supabase.from('users').update({ password: newPassword }).eq('id', id);
  res.json({ success: !error });
});

// ✅ Tambah Sparepart
app.post('/spareparts', async (req, res) => {
  const { name, price, stock } = req.body;
  const { error } = await supabase
    .from('spareparts')
    .insert([{ name, price, in_stock: stock || 0 }]);
  res.json({ success: !error });
});

// ✅ Senarai Sparepart
app.get('/spareparts', async (req, res) => {
  const { data, error } = await supabase.from('spareparts').select('*');
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// ✅ Restock
app.post('/restock', async (req, res) => {
  const { id, qty, user_id } = req.body;
  if (!id || !qty || !user_id || qty <= 0) {
    return res.status(400).json({ success: false, message: "Maklumat tidak lengkap" });
  }

  const ambil = await supabase.from('spareparts').select('in_stock').eq('id', id).single();
  if (!ambil.data) return res.json({ success: false });

  const update = await supabase
    .from('spareparts')
    .update({ in_stock: ambil.data.in_stock + qty })
    .eq('id', id);
  if (update.error) return res.json({ success: false });

  const today = new Date().toISOString().split("T")[0];
  const log = await supabase.from('log_restock').insert([{
    sparepart_id: id,
    user_id,
    qty,
    restock_date: today
  }]);
  if (log.error) return res.json({ success: false });
  res.json({ success: true });
});

// ✅ Log Restock
app.get('/log-restock', async (req, res) => {
  const { data, error } = await supabase
    .from('log_restock')
    .select(`
      id, qty, restock_date,
      spareparts(name),
      users(name)
    `)
    .order('restock_date', { ascending: false });

  if (error) return res.status(500).json({ error });

  const result = data.map(row => ({
    restock_date: row.restock_date,
    qty: row.qty,
    sparepart_name: row.spareparts?.name || '',
    user_name: row.users?.name || ''
  }));
  res.json(result);
});

// ✅ Guna Sparepart
app.post('/penggunaan', async (req, res) => {
  const { sparepart_id, no_resit, tarikh, tujuan } = req.body;
  if (!sparepart_id || !no_resit || !tarikh || !tujuan) {
    return res.status(400).json({ success: false });
  }

  const stok = await supabase.from('spareparts').select('in_stock').eq('id', sparepart_id).single();
  if (!stok.data || stok.data.in_stock <= 0) {
    return res.json({ success: false, message: "Stok habis!" });
  }

  const log = await supabase.from('usage_log').insert([{
    sparepart_id,
    receipt_no: no_resit,
    used_date: tarikh,
    tujuan,
    payment_status: 'belum bayar',
    restock_status: 'belum restock',
    update_status: 'belum update'
  }]);
  if (log.error) return res.json({ success: false });

  const update = await supabase
    .from('spareparts')
    .update({ in_stock: stok.data.in_stock - 1 })
    .eq('id', sparepart_id);

  res.json({ success: !update.error });
});

// ✅ Senarai Penggunaan
app.get('/penggunaan-penuh', async (req, res) => {
  const { nama = '', from = '', to = '', resit = '' } = req.query;

  let query = supabase
    .from('usage_log')
    .select(`
      id, used_date, receipt_no, tujuan,
      payment_status, restock_status, update_status,
      spareparts(name, price)
    `)
    .order('used_date', { ascending: false });

  if (nama) query = query.ilike('spareparts.name', `%${nama}%`);
  if (resit) query = query.ilike('receipt_no', `%${resit}%`);
  if (from) query = query.gte('used_date', from);
  if (to) query = query.lte('used_date', to);

  const { data, error } = await query;

  if (error) {
    console.error(error);
    return res.status(500).json({ error });
  }

  const formatted = data.map(row => ({
    ...row,
    name: row.spareparts?.name || '',
    price: row.spareparts?.price || 0
  }));

  res.json(formatted);
});

// ✅ Kemaskini Status Bayaran / Restock / Update
app.post('/kemaskini-status', async (req, res) => {
  const { id, payment, restock, update } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, message: "ID tidak lengkap" });
  }

  const { error } = await supabase
    .from('usage_log')
    .update({
      payment_status: payment,
      restock_status: restock,
      update_status: update
    })
    .eq('id', id);

  if (error) {
    console.error("Kemaskini Gagal:", error);
    return res.json({ success: false, message: "Kemaskini ke Supabase gagal" });
  }

  res.json({ success: true });
});

// ✅ API ringkas untuk guna.html (senarai terkini)
app.get('/penggunaan', async (req, res) => {
  const { data, error } = await supabase
    .from('usage_log')
    .select(`
      id, used_date, receipt_no, tujuan,
      spareparts(name, price)
    `)
    .order('used_date', { ascending: false })
    .limit(10); // boleh ubah ikut keperluan

  if (error) {
    console.error("❌ Error /penggunaan:", error);
    return res.status(500).json({ error });
  }

  const formatted = data.map(row => ({
    used_date: row.used_date,
    receipt_no: row.receipt_no,
    tujuan: row.tujuan,
    name: row.spareparts?.name || '',
    price: row.spareparts?.price || 0
  }));

  res.json(formatted);
});
// ✅ Laporan Bayaran
app.get('/laporan-bayaran', async (req, res) => {
  const { from, to } = req.query;

  let filter = supabase
    .from('usage_log')
    .select('payment_status, spareparts(price)', { count: 'exact' });

  if (from) filter = filter.gte('used_date', from);
  if (to) filter = filter.lte('used_date', to);

  const { data, error } = await filter;

  if (error) return res.status(500).json({ error });

  let sudah_bayar = 0, belum_bayar = 0;
  data.forEach(row => {
    const price = row.spareparts?.price || 0;
    if (row.payment_status === 'sudah bayar') sudah_bayar += price;
    if (row.payment_status === 'belum bayar') belum_bayar += price;
  });

  res.json({
    sudah_bayar,
    belum_bayar,
    jumlah_keseluruhan: sudah_bayar + belum_bayar
  });
});
// ✅ Grafik Penggunaan
app.get('/grafik-penggunaan', async (req, res) => {
  const { bulan } = req.query;
  if (!bulan) return res.json([]);

  const from = `${bulan}-01`;

  // Ambil hari terakhir bulan
  const [year, month] = bulan.split("-");
  const lastDay = new Date(year, month, 0).getDate(); // Bulan di JS bermula dari 0
  const to = `${bulan}-${lastDay}`;

  const { data, error } = await supabase
    .from('usage_log')
    .select('spareparts(name), used_date')
    .gte('used_date', from)
    .lte('used_date', to);

  if (error) {
    console.error("Grafik Error:", error);
    return res.status(500).json({ error });
  }

  const countMap = {};
  data.forEach(row => {
    const name = row.spareparts?.name || 'Tidak Diketahui';
    countMap[name] = (countMap[name] || 0) + 1;
  });

  const result = Object.entries(countMap).map(([label, count]) => ({ label, count }));
  res.json(result);
});
// ✅ Terima permintaan model baru
app.post('/permintaan', async (req, res) => {
  const { model, note, user_id } = req.body;

  if (!model || !user_id) {
    return res.status(400).json({ success: false, message: "Maklumat tidak lengkap" });
  }

  const today = new Date().toISOString().split("T")[0];

  const { error } = await supabase.from('permintaan_model').insert([
    {
      model,
      note,
      user_id,
      request_date: today
    }
  ]);

  if (error) {
    console.error("Permintaan Error:", error);
    return res.status(500).json({ success: false, message: "Gagal simpan permintaan" });
  }

  res.json({ success: true });
});

// ✅ Endpoint: Senarai Permintaan
app.get('/senarai-permintaan', async (req, res) => {
  const { data, error } = await supabase
    .from('permintaan_model')
    .select(`
  model,
  note,
  request_date,
  users!fk_user(name)
`)
    .order('request_date', { ascending: false });

  if (error) {
    console.error("Senarai Permintaan Error:", error);
    return res.status(500).json({ error });
  }

  const formatted = data.map(row => ({
    model: row.model,
    note: row.note,
    request_date: row.request_date,
    user_name: row.users?.name || '-'
  }));

  res.json(formatted);
});

app.get('/graf-permintaan', async (req, res) => {
  const { data, error } = await supabase.rpc('get_permintaan_summary');

  if (error) {
    console.error("Graf Permintaan Error:", error);
    return res.status(500).json({ error });
  }

  res.json(data); // format: [{ label: "LCD iPhone X", count: 5 }, ...]
});

// ✅ Mula Server
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});
