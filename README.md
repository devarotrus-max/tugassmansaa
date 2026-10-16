# tugassmansaa — portal kelas XI.A5

## 1. Database
Buka Supabase → SQL Editor → New query. Salin seluruh `supabase/schema.sql`, tempel, lalu Run sekali pada project yang baru dibuat.

## 2. Konfigurasi
Buka Supabase Project Settings → API. Salin Project URL dan anon/public key, lalu edit `config.js`. Ganti kedua teks `PASTE_...`. Jangan pernah gunakan `service_role` key di frontend dan jangan bagikan password database.

## 3. Akun admin
Di Supabase → Authentication → Users, invite email milik sendiri. Selesaikan undangan melalui email. Salin UUID akun dari daftar Users, lalu jalankan di SQL Editor (ganti UUID):
`update public.profiles set role='admin', full_name='Admin XI.A5' where id='UUID-AKUN-ADMIN';`
Akun siswa juga dibuat/diundang lewat Authentication → Users; profil otomatis menjadi student. Pendaftaran publik tidak tersedia.

## 4. Deploy dari HP
Unggah semua file ke repository GitHub, lalu impor repository di Vercel sebagai proyek static (Framework: Other; build command kosong). Setelah deploy, buka Supabase → Authentication → URL Configuration, isi Site URL dengan URL website dan tambahkan URL itu ke Redirect URLs.

Website ini adalah starter project. Jadwal di halaman merupakan ringkasan dan harus dicocokkan dengan jadwal resmi. Sebelum mengisi data siswa sungguhan, minta izin guru/sekolah dan uji keamanan akses.
