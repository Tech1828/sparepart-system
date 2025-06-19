const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// ✅ Sambung ke Supabase
const supabase = createClient(
  'https://ealntchcckxuhrrefiae.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhbG50Y2hjY2t4dWhycmVmaWFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzMTEwMDYsImV4cCI6MjA2NTg4NzAwNn0.-cmbcuMZefeQGTCBK-R0WzbRqw4lqdjgaMryT0uIxlw'
);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// ✅ API root
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

// ✅ Tukar Kata Laluan
app.post('/tukar-password', async (req, res) => {
  const { username, oldPassword, newPassword } = req.body;
  const { data, error } = await supabase
    .from('users')
    .select()
    .eq('username', username)
    .eq('password', oldPassword)
    .eq('role', 'staff')
    .single();

  if (error || !data) return res.json({ success: false, message: "Kata laluan lama salah" });

  const update = await supabase
    .from('users')
    .update({ password: newPassword })
    .eq('username', username);

  if (update.error) return res.json({ success: false });
  res.json({ success: true, message: "Kata laluan berjaya ditukar" });
});

// ✅ Tambah Staff
app.post('/tambah-user', async (req, res) => {
  const { name, username, password, position } = req.body;
  const { error } = await supabase.from('users').insert([
    { name, username, password, position, role: 'staff' }
  ]);

  if (error) return res.json({ success: false, message: "Gagal tambah user" });
  res.json({ success: true });
});

// ✅ Senarai User
app.get('/senarai-user', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, username, position')
    .eq('role', 'staff')
    .order('name');

  if (error) return res.status(500).json({ error });
  res.json(data);
});

// ✅ Padam User
app.post('/padam-user', async (req, res) => {
  const { id } = req.body;
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', id)
    .eq('role', 'staff');

  res.json({ success: !error });
});

// ✅ Reset Password
app.post('/reset-password', async (req, res) => {
  const { id, newPassword } = req.body;
  const { error } = await supabase
    .from('users')
    .update({ password: newPassword })
    .eq('id', id)
    .eq('role', 'staff');

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

// ✅ Ambil semua spareparts
app.get('/spareparts', async (req, res) => {
  const { data, error } = await supabase.from('spareparts').select('*');
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// ✅ Guna Sparepart
app.post('/penggunaan', async (req, res) => {
  const { sparepart_id, no_resit, tarikh, tujuan } = req.body;
  const { data: stok } = await supabase
    .from('spareparts')
    .select('in_stock')
    .eq('id', sparepart_id)
    .single();

  if (!stok || stok.in_stock <= 0) return res.json({ success: false, message: "Stok habis!" });

  const insertLog = await supabase.from('usage_log').insert([{
    sparepart_id,
    receipt_no: no_resit,
    used_date: tarikh,
    tujuan,
    payment_status: 'belum bayar',
    restock_status: 'belum restock',
    update_status: 'belum update'
  }]);

  if (insertLog.error) return res.json({ success: false });

  const update = await supabase.rpc('kurang_stok', { sid: sparepart_id }); // Atau guna update manual
  res.json({ success: true });
});

// ✅ Penggunaan penuh
app.get('/penggunaan-penuh', async (req, res) => {
  const { nama = '', from = '', to = '', resit = '' } = req.query;
  let query = supabase
    .from('usage_log')
    .select(`
      id, used_date, receipt_no, tujuan, payment_status, restock_status, update_status,
      spareparts(name, price)
    `)
    .order('used_date', { ascending: false });

  if (nama) query = query.ilike('spareparts.name', `%${nama}%`);
  if (resit) query = query.ilike('receipt_no', `%${resit}%`);
  if (from) query = query.gte('used_date', from);
  if (to) query = query.lte('used_date', to);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error });
  res.json(data.map(row => ({
    ...row,
    name: row.spareparts.name,
    price: row.spareparts.price
  })));
});

// ✅ Laporan Bayaran
app.get('/laporan-bayaran', async (req, res) => {
  const { from, to } = req.query;

  let filter = supabase
    .from('usage_log')
    .select('payment_status, spareparts(price)', { count: 'exact' })
    .eq('spareparts.id', 'sparepart_id');

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

// ✅ Mula server
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});
