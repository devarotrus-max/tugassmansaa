(() => {
  "use strict";

  // =========================================
  // 1. KONEKSI SUPABASE
  // =========================================

  const $ = (id) => document.getElementById(id);

  function getSupabaseConfig() {
    const candidates = [
      [
        typeof SUPABASE_URL !== "undefined" ? SUPABASE_URL : "",
        typeof SUPABASE_ANON_KEY !== "undefined"
          ? SUPABASE_ANON_KEY
          : ""
      ],
      [
        typeof supabaseUrl !== "undefined" ? supabaseUrl : "",
        typeof supabaseAnonKey !== "undefined"
          ? supabaseAnonKey
          : ""
      ],
      [
        typeof supabaseURL !== "undefined" ? supabaseURL : "",
        typeof supabaseKey !== "undefined" ? supabaseKey : ""
      ],
      [
        window.SUPABASE_URL || "",
        window.SUPABASE_ANON_KEY || ""
      ],
      [
        window.supabaseUrl || "",
        window.supabaseAnonKey || ""
      ]
    ];

    return candidates.find(([url, key]) =>
      typeof url === "string" &&
      typeof key === "string" &&
      /^https:\/\/.+\.supabase\.co\/?$/.test(url) &&
      key.length > 10
    );
  }

  if (!window.supabase?.createClient) {
    alert(
      "Supabase belum berhasil dimuat. Periksa script Supabase di index.html dan koneksi internet."
    );
    return;
  }

  const config = getSupabaseConfig();

  if (!config) {
    alert(
      "Konfigurasi Supabase tidak terbaca. Periksa format variabel di config.js. Jangan mengganti URL atau key lama."
    );
    return;
  }

  const [SUPABASE_URL, SUPABASE_ANON_KEY] = config;

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  let currentUser = null;
  let currentProfile = null;
  let tasks = [];
  let announcements = [];
  let loginInProgress = false;

  // =========================================
  // 2. UTILITAS
  // =========================================

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function message(element, text, success = false) {
    if (!element) return;

    element.textContent = text;
    element.style.color = success ? "#4ade80" : "#fca5a5";
  }

  function formatDate(value) {
    if (!value) return "Belum ditentukan";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function showLogin() {
    if ($("loginPage")) $("loginPage").hidden = false;
    if ($("dashboard")) $("dashboard").hidden = true;

    [
      "tasksPage",
      "schedulePage",
      "announcementsPage",
      "musicPage"
    ].forEach((id) => {
      if ($(id)) $(id).hidden = true;
    });

    const topbar = document.querySelector(".topbar");
    if (topbar) topbar.hidden = true;
  }

  function showDashboard() {
    if ($("loginPage")) $("loginPage").hidden = true;
    if ($("dashboard")) $("dashboard").hidden = false;

    const topbar = document.querySelector(".topbar");
    if (topbar) topbar.hidden = false;

    if ($("profileName")) {
      $("profileName").textContent =
        currentProfile?.full_name ||
        currentUser?.email ||
        "Siswa";
    }

    if ($("profileClass")) {
      $("profileClass").textContent =
        currentProfile?.class_name || "XI.A5";
    }

    openPage("home");
  }

  // =========================================
  // 3. NAVIGASI
  // =========================================

  const pages = {
    home: "dashboard",
    tasks: "tasksPage",
    schedule: "schedulePage",
    announcements: "announcementsPage",
    music: "musicPage"
  };

  const pageTitles = {
    home: "Dashboard",
    tasks: "Daftar Tugas",
    schedule: "Jadwal Pelajaran",
    announcements: "Pengumuman",
    music: "Music Lounge"
  };

  function openPage(name) {
    if (!pages[name]) return;

    if (!currentUser) {
      showLogin();
      return;
    }

    Object.values(pages).forEach((id) => {
      if ($(id)) $(id).hidden = true;
    });

    if ($(pages[name])) {
      $(pages[name]).hidden = false;
    }

    document.querySelectorAll("[data-page]").forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.page === name
      );
    });

    if ($("pageTitle")) {
      $("pageTitle").textContent = pageTitles[name];
    }
  }

  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      openPage(button.dataset.page);
    });
  });

  document.querySelectorAll("[data-goto]").forEach((button) => {
    button.addEventListener("click", () => {
      openPage(button.dataset.goto);
    });
  });

  // =========================================
  // 4. STATUS TUGAS
  // Catatan: tersimpan di browser perangkat ini.
  // =========================================

  function completedIds() {
    if (!currentUser) return [];

    try {
      return JSON.parse(
        localStorage.getItem(
          "completed_tasks_" + currentUser.id
        ) || "[]"
      );
    } catch {
      return [];
    }
  }

  function isCompleted(id) {
    return completedIds().includes(String(id));
  }

  function toggleCompleted(id) {
    const previous = completedIds();
    const key = String(id);

    const next = previous.includes(key)
      ? previous.filter((item) => item !== key)
      : [...previous, key];

    localStorage.setItem(
      "completed_tasks_" + currentUser.id,
      JSON.stringify(next)
    );

    renderTasks();
    updateStats();
  }

  // =========================================
  // 5. LOGIN
  // =========================================

  const loginForm = $("loginForm");

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (loginInProgress) return;

      const email = $("email")?.value.trim();
      const password = $("password")?.value;
      const button = loginForm.querySelector(
        'button[type="submit"]'
      );

      if (!email || !password) {
        message(
          $("loginMessage"),
          "Masukkan email dan password terlebih dahulu."
        );
        return;
      }

      loginInProgress = true;

      if (button) {
        button.disabled = true;
        button.textContent = "Sedang masuk...";
      }

      message($("loginMessage"), "Menghubungkan ke Supabase...");

      try {
        const { data, error } = await db.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        currentUser = data.user;

        if (!currentUser) {
          throw new Error("Pengguna tidak ditemukan setelah login.");
        }

        message(
          $("loginMessage"),
          "Login berhasil. Memuat profil...",
          true
        );

        await loadProfile();

        if (!currentProfile) {
          await db.auth.signOut();
          currentUser = null;

          showLogin();

          throw new Error(
            "Profil belum tersedia. Periksa tabel profiles di Supabase dan pastikan id profil sama dengan ID pengguna di Authentication."
          );
        }

        showDashboard();

        // Dashboard ditampilkan sebelum data tambahan dimuat,
        // sehingga kegagalan memuat tugas tidak menghalangi login.
        await loadData();

      } catch (error) {
        console.error("Login error:", error);

        showLogin();

        message(
          $("loginMessage"),
          error.message || "Login gagal. Periksa koneksi dan akun."
        );
      } finally {
        loginInProgress = false;

        if (button) {
          button.disabled = false;
          button.textContent = "Masuk ke Dashboard →";
        }
      }
    });
  } else {
    console.error(
      "Elemen loginForm tidak ditemukan. Periksa index.html."
    );
  }

  // =========================================
  // 6. MEMUAT PROFIL
  // =========================================

  async function loadProfile() {
    const { data, error } = await db
      .from("profiles")
      .select("id, full_name, role, class_name")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (error) {
      console.error("Profile error:", error);
      throw new Error(
        "Gagal membaca profil. Periksa izin SELECT pada tabel profiles di Supabase."
      );
    }

    currentProfile = data;
  }

  // =========================================
  // 7. MEMUAT DATA
  // =========================================

  async function loadData() {
    // Error pada satu tabel tidak menghentikan tabel lainnya.
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
      .select(
        "id, title, description, due_date, class_name, created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Tasks error:", error);
      tasks = [];

      if ($("recentTasks")) {
        $("recentTasks").textContent =
          "Tugas belum bisa dimuat. Periksa tabel tasks dan izin aksesnya.";
      }

      if ($("allTasks")) {
        $("allTasks").textContent =
          "Tugas belum bisa dimuat. Periksa tabel tasks dan izin aksesnya.";
      }

      return;
    }

    const className = currentProfile?.class_name;

    tasks = (data || []).filter((task) =>
      !task.class_name ||
      !className ||
      task.class_name === className
    );
  }

  async function loadAnnouncements() {
    const { data, error } = await db
      .from("announcements")
      .select("id, title, content, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Announcements error:", error);
      announcements = [];

      if ($("recentAnnouncements")) {
        $("recentAnnouncements").textContent =
          "Pengumuman belum bisa dimuat. Periksa tabel announcements.";
      }

      if ($("allAnnouncements")) {
        $("allAnnouncements").textContent =
          "Pengumuman belum bisa dimuat. Periksa tabel announcements.";
      }

      return;
    }

    announcements = data || [];
  }

  // =========================================
  // 8. TAMPILAN TUGAS
  // =========================================

  function taskHTML(task) {
    const done = isCompleted(task.id);

    return `
      <article class="task-item">
        <h4>${escapeHTML(task.title)}</h4>
        <p>${escapeHTML(task.description || "Tidak ada deskripsi.")}</p>
        <div class="task-meta">
          <small>Deadline: ${escapeHTML(formatDate(task.due_date))}</small>
          <span class="status ${done ? "done" : ""}">
            ${done ? "Selesai" : "Belum selesai"}
          </span>
        </div>
        <div style="margin-top:12px">
          <button class="primary-btn" data-toggle-task="${escapeHTML(task.id)}">
            ${done ? "Batalkan selesai" : "Tandai selesai"}
          </button>
        </div>
      </article>
    `;
  }

  function renderTasks() {
    const recent = $("recentTasks");
    const all = $("allTasks");

    if (recent) {
      recent.innerHTML = tasks.length
        ? tasks.slice(0, 4).map(taskHTML).join("")
        : '<p class="muted">Belum ada tugas yang tersedia.</p>';
    }

    if (all) {
      all.innerHTML = tasks.length
        ? tasks.map(taskHTML).join("")
        : '<p class="muted">Belum ada tugas yang tersedia.</p>';
    }

    document.querySelectorAll("[data-toggle-task]").forEach((button) => {
      button.addEventListener("click", () => {
        toggleCompleted(button.dataset.toggleTask);
      });
    });
  }

  // =========================================
  // 9. TAMPILAN PENGUMUMAN
  // =========================================

  function announcementHTML(item) {
    return `
      <article class="announcement-item">
        <h4>${escapeHTML(item.title)}</h4>
        <p>${escapeHTML(item.content || "Tidak ada isi pengumuman.")}</p>
        <div class="task-meta">
          <small>${escapeHTML(formatDate(item.created_at))}</small>
        </div>
      </article>
    `;
  }

  function renderAnnouncements() {
    if ($("recentAnnouncements")) {
      $("recentAnnouncements").innerHTML = announcements.length
        ? announcements.slice(0, 4).map(announcementHTML).join("")
        : '<p class="muted">Belum ada pengumuman.</p>';
    }

    if ($("allAnnouncements")) {
      $("allAnnouncements").innerHTML = announcements.length
        ? announcements.map(announcementHTML).join("")
        : '<p class="muted">Belum ada pengumuman.</p>';
    }
  }

  // =========================================
  // 10. STATISTIK
  // =========================================

  function updateStats() {
    const completed = tasks.filter((task) =>
      isCompleted(task.id)
    ).length;

    if ($("taskCount")) {
      $("taskCount").textContent = tasks.length;
    }

    if ($("pendingCount")) {
      $("pendingCount").textContent = tasks.length - completed;
    }

    if ($("announcementCount")) {
      $("announcementCount").textContent = announcements.length;
    }
  }

  // =========================================
  // 11. SPOTIFY
  // =========================================

  const spotifyButton = $("loadSpotify");

  if (spotifyButton) {
    spotifyButton.addEventListener("click", () => {
      const input = $("spotifyUrl")?.value.trim() || "";
      const player = $("spotifyPlayer");
      const status = $("spotifyMessage");

      let url;

      try {
        url = new URL(input);
      } catch {
        message(status, "Masukkan link Spotify yang valid.");
        return;
      }

      if (url.hostname !== "open.spotify.com") {
        message(status, "Gunakan link dari open.spotify.com.");
        return;
      }

      const match = url.pathname.match(
        /^\/(playlist|album|track|episode|show)\/([a-zA-Z0-9]+)/
      );

      if (!match) {
        message(
          status,
          "Link tidak dikenali. Gunakan link playlist, album, lagu, atau podcast."
        );
        return;
      }

      const embedURL =
        `https://open.spotify.com/embed/${match[1]}/${match[2]}`;

      if (player) {
        player.innerHTML = "";

        const iframe = document.createElement("iframe");
        iframe.src = embedURL;
        iframe.title = "Spotify Player";
        iframe.width = "100%";
        iframe.height = "352";
        iframe.loading = "lazy";
        iframe.allow =
          "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
        iframe.style.border = "0";
        iframe.style.borderRadius = "13px";

        player.appendChild(iframe);
      }

      message(status, "Player Spotify berhasil dimuat.", true);
    });
  }

  // =========================================
  // 12. LOGOUT
  // =========================================

  const logoutButton = $("logoutBtn");

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      logoutButton.disabled = true;

      try {
        const { error } = await db.auth.signOut();

        if (error) throw error;

        currentUser = null;
        currentProfile = null;
        tasks = [];
        announcements = [];

        if ($("loginForm")) $("loginForm").reset();

        message($("loginMessage"), "");
        showLogin();
      } catch (error) {
        console.error("Logout error:", error);
        alert("Gagal keluar: " + error.message);
      } finally {
        logoutButton.disabled = false;
      }
    });
  }

  // =========================================
  // 13. MEMULIHKAN SESI
  // =========================================

  async function initialize() {
    showLogin();

    try {
      const { data, error } = await db.auth.getSession();

      if (error) throw error;

      if (!data.session) return;

      currentUser = data.session.user;

      await loadProfile();

      if (!currentProfile) {
        await db.auth.signOut();
        currentUser = null;

        message(
          $("loginMessage"),
          "Profil belum tersedia. Periksa tabel profiles di Supabase."
        );

        return;
      }

      showDashboard();
      await loadData();

    } catch (error) {
      console.error("Session error:", error);
      showLogin();

      message(
        $("loginMessage"),
        error.message || "Gagal memulihkan sesi login."
      );
    }
  }

  // =========================================
  // 14. MULAI APLIKASI
  // =========================================

  initialize();

})();
