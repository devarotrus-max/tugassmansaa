
(()=>{
  const $ = id => document.getElementById(id);
  let sb = null;
  let profile = null;
  let currentUser = null;
  let tasks = [];
  let announcements = [];
  let activeFilter = 'all';
  let doneIds = new Set();

  const SITE_URL = 'https://tugassmansaa-9qrc.vercel.app';

  // Contoh jadwal: ganti sesuai jadwal resmi XI.A5.
  const schedule = [
    {day:'Senin', lessons:[
      {time:'07.00–08.30',subject:'Upacara / pelajaran pertama'},
      {time:'08.30–10.00',subject:'Matematika'},
      {time:'10.15–11.45',subject:'Bahasa Indonesia'}
    ]},
    {day:'Selasa', lessons:[
      {time:'07.00–08.30',subject:'Bahasa Inggris'},
      {time:'08.30–10.00',subject:'Sejarah'},
      {time:'10.15–11.45',subject:'Informatika'}
    ]},
    {day:'Rabu', lessons:[
      {time:'07.00–08.30',subject:'Fisika'},
      {time:'08.30–10.00',subject:'Kimia'},
      {time:'10.15–11.45',subject:'Matematika'}
    ]},
    {day:'Kamis', lessons:[
      {time:'07.00–08.30',subject:'Biologi'},
      {time:'08.30–10.00',subject:'Bahasa Indonesia'},
      {time:'10.15–11.45',subject:'Pendidikan Pancasila'}
    ]},
    {day:'Jumat', lessons:[
      {time:'07.00–08.00',subject:'Pendidikan Agama'},
      {time:'08.00–09.30',subject:'PJOK'},
      {time:'09.45–11.00',subject:'Projek / kegiatan kelas'}
    ]}
  ];

  const msg = (id,text)=>{
    const el=$(id);
    if(el) el.textContent=text||'';
  };

  const esc = s => String(s??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  const dateText = value => {
    if(!value) return 'Tanpa tenggat';
    const d=new Date(value);
    return Number.isNaN(d.getTime())?'Tanggal tidak tersedia':
      d.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});
  };

  function init(){
    if(!window.supabase || !window.SUPABASE_URL ||
       !window.SUPABASE_ANON_KEY ||
       window.SUPABASE_URL.includes('PASTE_') ||
       window.SUPABASE_ANON_KEY.includes('PASTE_')){
      msg('loginMsg','Konfigurasi Supabase di config.js belum benar.');
      return false;
    }

    if(!sb){
      sb=window.supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_ANON_KEY
      );
    }
    return true;
  }

  function showLogin(){
    $('loginPanel').hidden=false;
    $('appPanel').hidden=true;
    $('recoveryPanel').hidden=true;
  }

  function showRecovery(){
    $('loginPanel').hidden=true;
    $('appPanel').hidden=true;
    $('recoveryPanel').hidden=false;
  }

  function getDoneStorageKey(){
    return 'tugassmansaa_done_'+(currentUser?.id||'guest');
  }

  function loadDoneIds(){
    try{
      const saved=JSON.parse(localStorage.getItem(getDoneStorageKey())||'[]');
      doneIds=new Set(Array.isArray(saved)?saved.map(String):[]);
    }catch{
      doneIds=new Set();
    }
  }

  function saveDoneIds(){
    try{
      localStorage.setItem(getDoneStorageKey(),JSON.stringify([...doneIds]));
    }catch{
      msg('adminMsg','Status tugas tidak dapat disimpan di browser ini.');
    }
  }

  function updateProfileUI(){
    const name=profile?.full_name||currentUser?.email||'Siswa XI.A5';
    const className=profile?.class_name||'XI.A5';
    const role=profile?.role==='admin'?'Admin':'Siswa';
    const initials=name.trim().split(/\s+/).slice(0,2)
      .map(x=>x[0]||'').join('').toUpperCase()||'XI';

    $('hello').textContent='Halo, '+name+'!';
    $('profileName').textContent=name;
    $('profileEmail').textContent=currentUser?.email||'-';
    $('profileAvatar').textContent=initials;
    $('profileFullName').textContent=profile?.full_name||'Belum diisi';
    $('profileClass').textContent=className;
    $('profileRole').textContent=role.toUpperCase();
    $('profileRoleDetail').textContent=role;
    $('adminPanel').hidden=profile?.role!=='admin';
  }

  async function show(session){
    if(!session){
      profile=null;
      currentUser=null;
      tasks=[];
      announcements=[];
      doneIds=new Set();
      showLogin();
      return;
    }

    currentUser=session.user;
    msg('loginMsg','Memuat profil akun...');

    const {data,error}=await sb.from('profiles')
      .select('id,full_name,role,class_name')
      .eq('id',session.user.id)
      .maybeSingle();

    if(error||!data){
      msg('loginMsg','Profil belum tersedia. Periksa akun dan tabel profiles.');
      await sb.auth.signOut();
      showLogin();
      return;
    }

    profile=data;
    loadDoneIds();
    $('loginPanel').hidden=true;
    $('recoveryPanel').hidden=true;
    $('appPanel').hidden=false;

    updateProfileUI();
    renderSchedule();
    activateTab('dashboardTab');

    await Promise.all([loadTasks(),loadAnnouncements()]);
    msg('loginMsg','');
  }

  function taskIsDone(task){
    return doneIds.has(String(task.id));
  }

  function renderTaskCard(task,compact=false){
    const done=taskIsDone(task);
    const due=task.due_date
      ? 'Tenggat: '+dateText(task.due_date)
      : 'Tanpa tenggat';

    return `<article class="item ${done?'task-completed':''}">
      <div class="item-head">
        <strong>${esc(task.title||'Tugas tanpa judul')}</strong>
        <button type="button"
          class="task-toggle ${done?'is-done':''}"
          data-toggle-task="${esc(task.id)}"
          aria-pressed="${done}">
          ${done?'✓ Selesai':'+ Tandai selesai'}
        </button>
      </div>
      ${compact?'':`<p>${esc(task.description||'Tidak ada deskripsi.')}</p>`}
      <div class="item-meta">
        <span class="pill ${done?'done':'pending'}">${done?'✓ Sudah selesai':'○ Belum selesai'}</span>
        <span class="pill">${esc(due)}</span>
      </div>
    </article>`;
  }

  function renderTaskList(){
    const visible=tasks.filter(task=>{
      if(activeFilter==='done') return taskIsDone(task);
      if(activeFilter==='pending') return !taskIsDone(task);
      return true;
    });

    $('taskList').innerHTML=visible.length
      ?visible.map(t=>renderTaskCard(t)).join('')
      :'<p class="muted">'+(activeFilter==='done'
        ?'Belum ada tugas yang ditandai selesai.'
        :activeFilter==='pending'
          ?'Semua tugas sudah selesai. Mantap!'
          :'Belum ada tugas.')+'</p>';

    $('recentTasks').innerHTML=tasks.length
      ?tasks.slice(0,3).map(t=>renderTaskCard(t,true)).join('')
      :'<p class="muted">Belum ada tugas baru.</p>';

    const total=tasks.length;
    const completed=tasks.filter(taskIsDone).length;
    const remaining=total-completed;

    $('totalTasks').textContent=total;
    $('completedTasks').textContent=completed;
    $('remainingTasks').textContent=remaining+' tugas belum selesai';
    $('taskPageTotal').textContent=total;
    $('taskPageDone').textContent=completed;
    $('taskPageLeft').textContent=remaining;
  }

  async function loadTasks(){
    $('taskList').innerHTML='<p class="muted">Memuat tugas...</p>';

    const {data,error}=await sb.from('tasks')
      .select('*').order('created_at',{ascending:false});

    if(error){
      tasks=[];
      renderTaskList();
      $('taskList').innerHTML=
        '<p class="muted">Gagal memuat tugas: '+esc(error.message)+'</p>';
      return;
    }

    tasks=data||[];
    renderTaskList();
  }

  function renderAnnouncementCard(item,compact=false){
    return `<article class="item">
      <div class="item-head">
        <strong>${esc(item.title||'Pengumuman')}</strong>
        <span class="pill">INFO KELAS</span>
      </div>
      <p>${esc(item.content||'')}</p>
      <small>${esc(dateText(item.created_at))}</small>
    </article>`;
  }

  async function loadAnnouncements(){
    $('announcementList').innerHTML='<p class="muted">Memuat pengumuman...</p>';

    const {data,error}=await sb.from('announcements')
      .select('*').order('created_at',{ascending:false});

    if(error){
      announcements=[];
      $('announcementList').innerHTML=
        '<p class="muted">Gagal memuat pengumuman: '+esc(error.message)+'</p>';
      $('recentAnnouncements').innerHTML=
        '<p class="muted">Pengumuman tidak dapat dimuat.</p>';
      $('totalAnnouncements').textContent='—';
      return;
    }

    announcements=data||[];
    $('announcementList').innerHTML=announcements.length
      ?announcements.map(a=>renderAnnouncementCard(a)).join('')
      :'<p class="muted">Belum ada pengumuman kelas.</p>';

    $('recentAnnouncements').innerHTML=announcements.length
      ?announcements.slice(0,2).map(a=>renderAnnouncementCard(a,true)).join('')
      :'<p class="muted">Belum ada informasi terbaru.</p>';

    $('totalAnnouncements').textContent=announcements.length;
  }

  function renderSchedule(){
    $('scheduleList').innerHTML=schedule.map(day=>`
      <article class="schedule-day">
        <h3>${esc(day.day)}</h3>
        ${day.lessons.map(lesson=>`
          <div class="schedule-entry">
            <span class="schedule-time">${esc(lesson.time)}</span>
            <span class="schedule-subject">
              ${esc(lesson.subject)}
              <small class="schedule-room">XI.A5</small>
            </span>
          </div>`).join('')}
      </article>`).join('');
  }

  function activateTab(tabId){
    document.querySelectorAll('.tabcontent').forEach(section=>{
      section.hidden=section.id!==tabId;
    });
    document.querySelectorAll('.nav-item').forEach(button=>{
      const active=button.dataset.tab===tabId;
      button.classList.toggle('active',active);
      if(active) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
  }

  // Navigasi utama
  document.querySelectorAll('.nav-item').forEach(button=>{
    button.addEventListener('click',()=>{
      activateTab(button.dataset.tab);
    });
  });

  document.querySelectorAll('[data-goto]').forEach(button=>{
    button.addEventListener('click',()=>{
      activateTab(button.dataset.goto);
      $('appPanel').scrollIntoView({behavior:'smooth',block:'start'});
    });
  });

  // Filter tugas
  document.querySelectorAll('[data-filter]').forEach(button=>{
    button.addEventListener('click',()=>{
      activeFilter=button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(item=>{
        item.classList.toggle('active',item===button);
      });
      renderTaskList();
    });
  });

  // Tandai tugas selesai / batalkan status selesai
  async function handleTaskToggle(event){
    const button=event.target.closest('[data-toggle-task]');
    if(!button) return;

    const id=String(button.dataset.toggleTask);
    if(doneIds.has(id)) doneIds.delete(id);
    else doneIds.add(id);

    saveDoneIds();
    renderTaskList();
  }

  $('taskList').addEventListener('click',handleTaskToggle);
  $('recentTasks').addEventListener('click',handleTaskToggle);

  // Login
  $('loginForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!init()) return;

    msg('loginMsg','Memeriksa akun...');
    const {error}=await sb.auth.signInWithPassword({
      email:$('email').value.trim(),
      password:$('password').value
    });

    if(error){
      msg('loginMsg',error.message);
      return;
    }

    const {data:{session}}=await sb.auth.getSession();
    await show(session);
  });

  // Minta email reset password
  $('resetBtn').addEventListener('click',async()=>{
    if(!init()) return;

    const email=$('email').value.trim();
    if(!email){
      msg('loginMsg','Isi email terlebih dahulu.');
      $('email').focus();
      return;
    }

    msg('loginMsg','Mengirim permintaan reset password...');
    const {error}=await sb.auth.resetPasswordForEmail(email,{
      redirectTo:SITE_URL+'/'
    });

    msg('loginMsg',error
      ?error.message
      :'Jika email terdaftar, instruksi reset akan dikirim.');
  });

  // Simpan password baru
  $('recoveryForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!init()) return;

    const password=$('newPassword').value;
    const confirm=$('confirmPassword').value;

    if(password.length<8){
      msg('recoveryMsg','Password minimal 8 karakter.');
      return;
    }
    if(password!==confirm){
      msg('recoveryMsg','Kedua password tidak sama.');
      return;
    }

    msg('recoveryMsg','Menyimpan password baru...');
    const {error}=await sb.auth.updateUser({password});

    if(error){
      msg('recoveryMsg','Gagal memperbarui password: '+error.message+
        '. Mungkin tautan sudah kedaluwarsa; minta tautan baru.');
      return;
    }

    msg('recoveryMsg','Password berhasil diubah! Silakan login kembali.');
    $('recoveryForm').reset();
    await sb.auth.signOut();
    showLogin();
    history.replaceState(null,'',SITE_URL+'/');
  });

  // Keluar dari akun
  async function logout(){
    if(!sb) return;
    const {error}=await sb.auth.signOut();
    if(error){
      msg('adminMsg','Gagal keluar: '+error.message);
      return;
    }
    show(null);
  }

  $('logoutBtn').addEventListener('click',logout);
  $('profileLogoutBtn').addEventListener('click',logout);

  // Admin: buat pengumuman
  $('announcementForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!sb||profile?.role!=='admin'){
      msg('adminMsg','Hanya admin yang bisa menerbitkan pengumuman.');
      return;
    }

    msg('adminMsg','Menerbitkan pengumuman...');
    const {error}=await sb.from('announcements').insert({
      title:$('announcementTitle').value.trim(),
      content:$('announcementContent').value.trim()
    });

    if(error){
      msg('adminMsg','Gagal menerbitkan pengumuman: '+error.message);
      return;
    }

    event.target.reset();
    msg('adminMsg','Pengumuman berhasil diterbitkan.');
    await loadAnnouncements();
  });

  // Admin: tambah tugas
  $('taskForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!sb||profile?.role!=='admin'){
      msg('adminMsg','Hanya admin yang bisa menambahkan tugas.');
      return;
    }

    const due=$('taskDue').value
      ?new Date($('taskDue').value).toISOString()
      :null;

    msg('adminMsg','Menambahkan tugas...');
    const {error}=await sb.from('tasks').insert({
      title:$('taskTitle').value.trim(),
      description:$('taskDescription').value.trim(),
      due_date:due,
      class_name:profile.class_name
    });

    if(error){
      msg('adminMsg','Gagal menambahkan tugas: '+error.message);
      return;
    }

    event.target.reset();
    msg('adminMsg','Tugas berhasil ditambahkan.');
    await loadTasks();
  });

  // Mulai aplikasi
  if(init()){
    const params=new URLSearchParams(location.hash.slice(1));
    const isRecovery=params.get('type')==='recovery';

    if(isRecovery) showRecovery();

    sb.auth.getSession().then(({data,error})=>{
      if(error){
        msg('loginMsg','Gagal memeriksa sesi login. Coba muat ulang halaman.');
        return;
      }
      if(isRecovery) showRecovery();
      else show(data.session);
    });

    sb.auth.onAuthStateChange(event=>{
      if(event==='PASSWORD_RECOVERY') showRecovery();
    });
  }
})();
