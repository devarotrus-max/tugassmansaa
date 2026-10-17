
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ======================================
  // SUPABASE
  // ======================================

  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;

  if (!window.supabase?.createClient) {
    alert("Supabase belum dimuat. Periksa koneksi internet.");
    return;
  }

  if (
    typeof url !== "string" ||
    typeof key !== "string" ||
    !url.startsWith("https://") ||
    !key
  ) {
    alert("Konfigurasi Supabase belum benar. Periksa config.js.");
    return;
  }

  const db = window.supabase.createClient(url, key);

  let currentUser = null;
  let profile = null;
  let tasks = [];
  let announcements = [];
  let busy = false;

  // ======================================
  // UTILITAS
  // ======================================

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);
  }

  function showMessage(text, success = false) {
    const el = $("loginMessage");
    if (!el) return;

    el.textContent = text;
    el.style.color = success ? "#4ade80" : "#fca5a5";
  }

  function dateText(value) {
    if (!value) return "Belum ditentukan";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric"
        });
  }

  function completedTasks() {
    if (!currentUser) return [];

    try {
      return JSON.parse(
        localStorage.getItem("a5_done_" + currentUser.id) || "[]"
      );
    } catch {
      return [];
    }
  }

  function isDone(id) {
    return completedTasks().includes(String(id));
  }

  // ======================================
  // HALAMAN DAN NAVIGASI
  // ======================================

  const pageIds = {
    home: "dashboard",
    tasks: "tasksPage",
    schedule: "schedulePage",
    announcements: "announcementsPage",
    music: "musicPage"
  };

  const pageNames = {
    home: "Dashboard",
    tasks: "Daftar Tugas",
    schedule: "Jadwal Pelajaran",
    announcements: "Pengumuman",
    music: "Music Lounge"
  };

  function showLogin() {
    if ($("loginPage")) $("loginPage").hidden = false;
    if ($("dashboard")) $("dashboard").hidden = true;

    ["tasksPage", "schedulePage", "announcementsPage", "musicPage"]
      .forEach((id) => {
        if ($(id)) $(id).hidden = true;
      });
  }

  function openPage(page) {
    if (!pageIds[page]) return;

    if (!currentUser) {
      showLogin();
      return;
    }

    Object.values(pageIds).forEach((id) => {
      if ($(id)) $(id).hidden = true;
    });

    if ($(pageIds[page])) $(pageIds[page]).hidden = false;

    if ($("pageTitle")) {
      $("pageTitle").textContent = pageNames[page];
    }

    document.querySelectorAll("[data-page]").forEach((button) => {
      button.classList.toggle("active", button.dataset.page === page);
    });
  }

  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => openPage(button.dataset.page));
  });

  document.querySelectorAll("[data-goto]").forEach((button) => {
    button.addEventListener("click", () => openPage(button.dataset.goto));
  });

  function showDashboard() {
    if ($("loginPage")) $("loginPage").hidden = true;

    if ($("profileName")) {
      $("profileName").textContent =
        profile?.full_name || currentUser?.email || "Siswa XI.A5";
    }

    if ($("profileClass")) {
      $("profileClass").textContent = profile?.class_name || "XI.A5";
    }

    openPage("home");
  }

  // ======================================
  // LOGIN
  // ======================================

  const loginForm = $("loginForm");

  if (!loginForm) {
    alert("Form login tidak ditemukan. Periksa index.html.");
    return;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (busy) return;

    const email = $("email")?.value.trim();
    const password = $("password")?.value;
    const button = loginForm.querySelector('[type="submit"]');

    if (!email || !password) {
      showMessage("Masukkan email dan password.");
      return;
    }

    busy = true;

    if (button) {
      button.disabled = true;
      button.textContent = "Memeriksa akun...";
    }

    showMessage("Menghubungkan ke Supabase...", true);

    try {
      const { data, error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      if (!data.user) {
        throw new Error("Akun tidak ditemukan.");
      }

      currentUser = data.user;

      // Profil tidak dibuat otomatis. Jika belum ada,
      // dashboard tetap bisa dibuka dengan nama default.
      profile = null;

      const result = await db
        .from("profiles")
        .select("id, full_name, role, class_name")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (result.error) {
        console.warn("Profil belum dapat dibaca:", result.error.message);
      } else {
        profile = result.data;
      }

      showDashboard();
      showMessage("", true);

      // Data tambahan dimuat terpisah agar kegagalannya
      // tidak membatalkan login yang sudah berhasil.
      await loadData();

    } catch (error) {
      console.error("Login gagal:", error);

      currentUser = null;
      profile = null;

      showLogin();

      showMessage(
        error.message || "Login gagal. Periksa koneksi dan akun."
      );
    } finally {
      busy = false;

      if (button) {
        button.disabled = false;
        button.textContent = "Masuk ke Dashboard →";
      }
    }
  });

  // ======================================
  // TUGAS DAN PENGUMUMAN
  // ======================================

  async function loadData() {
    await Promise.allSettled([
      loadTasks(),
      loadAnnouncements()
    ]);

    renderTasks();
    renderAnnouncements();
    updateStats();
  }

  async function loadTasks() {
    const { data, error } = await db
      .from("tasks")
      .select("id, title, description, due_date, class_name, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Gagal memuat tugas:", error);
      tasks = [];

      if ($("recentTasks")) {
        $("recentTasks").innerHTML =
          '<p class="muted">Tugas belum dapat dimuat.</p>';
      }

      if ($("allTasks")) {
        $("allTasks").innerHTML =
          '<p class="muted">Tugas belum dapat dimuat.</p>';
      }

      return;
    }

    tasks = (data || []).filter((task) =>
      !task.class_name ||
      !profile?.class_name ||
      task.class_name === profile.class_name
    );
  }

  async function loadAnnouncements() {
    const { data, error } = await db
      .from("announcements")
      .select("id, title, content, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Gagal memuat pengumuman:", error);
      announcements = [];

      if ($("recentAnnouncements")) {
        $("recentAnnouncements").innerHTML =
          '<p class="muted">Pengumuman belum dapat dimuat.</p>';
      }

      if ($("allAnnouncements")) {
        $("allAnnouncements").innerHTML =
          '<p class="muted">Pengumuman belum dapat dimuat.</p>';
      }

      return;
    }

    announcements = data || [];
  }

  function taskHTML(task) {
    const done = isDone(task.id);

    return `
      <article class="task-item">
        <h4>${escapeHTML(task.title)}</h4>
        <p>${escapeHTML(task.description || "Tidak ada deskripsi.")}</p>
        <div class="task-meta">
          <small>Deadline: ${escapeHTML(dateText(task.due_date))}</small>
          <span class="status ${done ? "done" : ""}">
            ${done ? "Selesai" : "Belum selesai"}
          </span>
        </div>
        <button type="button" class="primary-btn"
          data-toggle-task="${escapeHTML(task.id)}">
          ${done ? "Batalkan selesai" : "Tandai selesai"}
        </button>
      </article>
    `;
  }

  function renderTasks() {
    const recent = $("recentTasks");
    const all = $("allTasks");

    if (recent) {
      recent.innerHTML = tasks.length
        ? tasks.slice(0, 4).map(taskHTML).join("")
        : '<p class="muted">Belum ada tugas.</p>';
    }

    if (all) {
      all.innerHTML = tasks.length
        ? tasks.map(taskHTML).join("")
        : '<p class="muted">Belum ada tugas.</p>';
    }

    document.querySelectorAll("[data-toggle-task]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = String(button.dataset.toggleTask);
        const current = completedTasks();

        const updated = current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id];

        localStorage.setItem(
          "a5_done_" + currentUser.id,
          JSON.stringify(updated)
        );

        renderTasks();
        updateStats();
      });
    });
  }

  function announcementHTML(item) {
    return `
      <article class="announcement-item">
        <h4>${escapeHTML(item.title)}</h4>
        <p>${escapeHTML(item.content || "Tidak ada isi pengumuman.")}</p>
        <small>${escapeHTML(dateText(item.created_at))}</small>
      </article>
    `;
  }

  function renderAnnouncements() {
    const recent = $("recentAnnouncements");
    const all = $("allAnnouncements");

    if (recent) {
      recent.innerHTML = announcements.length
        ? announcements.slice(0, 4).map(announcementHTML).join("")
        : '<p class="muted">Belum ada pengumuman.</p>';
    }

    if (all) {
      all.innerHTML = announcements.length
        ? announcements.map(announcementHTML).join("")
        : '<p class="muted">Belum ada pengumuman.</p>';
    }
  }

  function updateStats() {
    const done = tasks.filter((task) => isDone(task.id)).length;

    if ($("taskCount")) $("taskCount").textContent = tasks.length;
    if ($("pendingCount")) {
      $("pendingCount").textContent = tasks.length - done;
    }
    if ($("announcementCount")) {
      $("announcementCount").textContent = announcements.length;
    }
  }

  // ======================================
  // SPOTIFY EMBED
  // ======================================

  if ($("loadSpotify")) {
    $("loadSpotify").addEventListener("click", () => {
      const input = $("spotifyUrl")?.value.trim() || "";
      const player = $("spotifyPlayer");
      const status = $("spotifyMessage");

      let parsed;

      try {
        parsed = new URL(input);
      } catch {
        if (status) status.textContent = "Masukkan link Spotify yang valid.";
        return;
      }

      if (parsed.hostname !== "open.spotify.com") {
        if (status) status.textContent = "Gunakan link dari open.spotify.com.";
        return;
      }

      const match = parsed.pathname.match(
        /^\/(playlist|album|track|episode|show)\/([a-zA-Z0-9]+)/
      );

      if (!match) {
        if (status) status.textContent = "Link playlist atau lagu tidak dikenali.";
        return;
      }

      const iframe = document.createElement("iframe");
      iframe.src = `https://open.spotify.com/embed/${match[1]}/${match[2]}`;
      iframe.title = "Spotify Player";
      iframe.width = "100%";
      iframe.height = "352";
      iframe.loading = "lazy";
      iframe.allow =
        "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
      iframe.style.border = "0";
      iframe.style.borderRadius = "12px";

      if (player) {
        player.replaceChildren(iframe);
      }

      if (status) status.textContent = "Player Spotify berhasil dimuat.";
    });
  }

  // ======================================
  // LOGOUT
  // ======================================

  if ($("logoutBtn")) {
    $("logoutBtn").addEventListener("click", async () => {
      const button = $("logoutBtn");
      button.disabled = true;

      try {
        const { error } = await db.auth.signOut();
        if (error) throw error;

        currentUser = null;
        profile = null;
        tasks = [];
        announcements = [];

        loginForm.reset();
        showMessage("");
        showLogin();

      } catch (error) {
        console.error("Logout gagal:", error);
        alert("Gagal keluar: " + error.message);
      } finally {
        button.disabled = false;
      }
    });
  }

  // ======================================
  // PULIHKAN SESI LOGIN
  // ======================================

  async function initialize() {
    showLogin();

    try {
      const { data, error } = await db.auth.getSession();
      if (error) throw error;

      if (!data.session) return;

      currentUser = data.session.user;

      const result = await db
        .from("profiles")
        .select("id, full_name, role, class_name")
        .eq("id", currentUser.id)
        .maybeSingle();

      profile = result.error ? null : result.data;

      showDashboard();
      await loadData();

    } catch (error) {
      console.error("Gagal memulihkan sesi:", error);
      showLogin();
      showMessage("Sesi belum dapat dipulihkan. Coba login kembali.");
    }
  }

  initialize();

})();
