
(()=>{
  const $ = id => document.getElementById(id);
  let sb, profile;

  const SITE_URL = 'https://tugassmansaa-9qrc.vercel.app';
  const msg = (id, text) => {
    const el = $(id);
    if (el) el.textContent = text || '';
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));

  function init() {
    if (!window.supabase ||
        !window.SUPABASE_URL ||
        !window.SUPABASE_ANON_KEY ||
        window.SUPABASE_URL.includes('PASTE_') ||
        window.SUPABASE_ANON_KEY.includes('PASTE_')) {
      msg('loginMsg', 'Konfigurasi Supabase di config.js belum benar.');
      return false;
    }

    if (!sb) {
      sb = window.supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_ANON_KEY
      );
    }
    return true;
  }

  function showRecovery() {
    if ($('loginPanel')) $('loginPanel').hidden = true;
    if ($('appPanel')) $('appPanel').hidden = true;
    if ($('recoveryPanel')) $('recoveryPanel').hidden = false;
  }

  async function show(session) {
    if (!session) {
      if ($('loginPanel')) $('loginPanel').hidden = false;
      if ($('appPanel')) $('appPanel').hidden = true;
      return;
    }

    const r = await sb.from('profiles')
      .select('*').eq('id', session.user.id).maybeSingle();

    if (r.error || !r.data) {
      msg('loginMsg', 'Profil belum tersedia. Periksa akun dan tabel profiles.');
      await sb.auth.signOut();
      return;
    }

    profile = r.data;
    $('loginPanel').hidden = true;
    $('appPanel').hidden = false;
    $('hello').textContent = 'Halo, ' +
      (profile.full_name || session.user.email) + '!';
    $('adminPanel').hidden = profile.role !== 'admin';

    await Promise.all([loadTasks(), loadAnnouncements()]);
  }

  async function loadTasks() {
    const {data, error} = await sb.from('tasks')
      .select('*').order('created_at', {ascending:false});

    $('taskList').innerHTML = error
      ? '<p class="muted">Gagal memuat tugas: '+esc(error.message)+'</p>'
      : data.length
        ? data.map(t =>
          '<article class="item"><strong>'+esc(t.title)+'</strong>'+
          '<p>'+esc(t.description)+'</p><small>'+
          (t.due_date
            ? 'Tenggat: '+esc(new Date(t.due_date).toLocaleString('id-ID'))
            : 'Tanpa tenggat')+
          '</small></article>').join('')
        : '<p class="muted">Belum ada tugas.</p>';
  }

  async function loadAnnouncements() {
    const {data, error} = await sb.from('announcements')
      .select('*').order('created_at', {ascending:false});

    $('announcementList').innerHTML = error
      ? '<p class="muted">Gagal memuat pengumuman: '+esc(error.message)+'</p>'
      : data.length
        ? data.map(a =>
          '<article class="item"><strong>'+esc(a.title)+'</strong>'+
          '<p>'+esc(a.content)+'</p><small>'+
          esc(new Date(a.created_at).toLocaleString('id-ID'))+
          '</small></article>').join('')
        : '<p class="muted">Belum ada pengumuman.</p>';
  }

  // Login
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!init()) return;

    msg('loginMsg', 'Memeriksa akun…');
    const {error} = await sb.auth.signInWithPassword({
      email: $('email').value.trim(),
      password: $('password').value
    });

    if (error) {
      msg('loginMsg', error.message);
      return;
    }

    msg('loginMsg', '');
    const {data:{session}} = await sb.auth.getSession();
    await show(session);
  });

  // Minta email reset password
  $('resetBtn').addEventListener('click', async () => {
    if (!init()) return;

    const email = $('email').value.trim();
    if (!email) {
      msg('loginMsg', 'Isi email terlebih dahulu.');
      return;
    }

    msg('loginMsg', 'Mengirim permintaan reset password…');
    const {error} = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: SITE_URL + '/'
    });

    msg('loginMsg', error
      ? error.message
      : 'Jika email terdaftar, instruksi reset akan dikirim.');
  });

  // Simpan password baru
  if ($('recoveryForm')) {
    $('recoveryForm').addEventListener('submit', async e => {
      e.preventDefault();
      if (!init()) return;

      const password = $('newPassword').value;
      const confirm = $('confirmPassword').value;

      if (password.length < 8) {
        msg('recoveryMsg', 'Password minimal 8 karakter.');
        return;
      }
      if (password !== confirm) {
        msg('recoveryMsg', 'Kedua password tidak sama.');
        return;
      }

      msg('recoveryMsg', 'Menyimpan password baru…');

      const {error} = await sb.auth.updateUser({password});

      if (error) {
        msg('recoveryMsg',
          'Gagal memperbarui password: '+error.message+
          '. Mungkin tautan sudah kedaluwarsa; minta tautan baru.');
        return;
      }

      msg('recoveryMsg', 'Password berhasil diubah! Silakan login dengan password baru.');

      $('recoveryForm').reset();
      await sb.auth.signOut();

      if ($('recoveryPanel')) $('recoveryPanel').hidden = true;
      if ($('loginPanel')) $('loginPanel').hidden = false;

      history.replaceState(null, '', SITE_URL + '/');
    });
  }

  // Keluar
  $('logoutBtn').addEventListener('click', async () => {
    await sb.auth.signOut();
    await show(null);
  });

  // Tab
  document.querySelectorAll('.tab').forEach(b =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x =>
        x.classList.toggle('active', x === b)
      );
      document.querySelectorAll('.tabcontent').forEach(x =>
        x.hidden = x.id !== b.dataset.tab
      );
    })
  );

  // Pengumuman admin
  $('announcementForm').addEventListener('submit', async e => {
    e.preventDefault();

    const {error} = await sb.from('announcements').insert({
      title: $('announcementTitle').value.trim(),
      content: $('announcementContent').value.trim()
    });

    msg('adminMsg', error ? error.message : 'Pengumuman diterbitkan.');

    if (!error) {
      e.target.reset();
      await loadAnnouncements();
    }
  });

  // Tugas admin
  $('taskForm').addEventListener('submit', async e => {
    e.preventDefault();

    const due = $('taskDue').value
      ? new Date($('taskDue').value).toISOString()
      : null;

    const {error} = await sb.from('tasks').insert({
      title: $('taskTitle').value.trim(),
      description: $('taskDescription').value.trim(),
      due_date: due,
      class_name: profile.class_name
    });

    msg('adminMsg', error ? error.message : 'Tugas ditambahkan.');

    if (!error) {
      e.target.reset();
      await loadTasks();
    }
  });

  // Inisialisasi dan deteksi tautan pemulihan
  if (init()) {
    const params = new URLSearchParams(location.hash.slice(1));
    const isRecovery = params.get('type') === 'recovery';

    if (isRecovery && $('recoveryPanel')) {
      showRecovery();
    }

    sb.auth.getSession().then(({data:{session}}) => {
      if (isRecovery && $('recoveryPanel')) {
        showRecovery();
      } else {
        show(session);
      }
    });

    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && $('recoveryPanel')) {
        showRecovery();
      }
    });
  }
})();
