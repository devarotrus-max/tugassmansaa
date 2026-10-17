(() => {
  "use strict";

  // ==========================================
  // 1. KONEKSI SUPABASE
  // Gunakan konfigurasi dari config.js lama
  // ==========================================

  function getConfig() {
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
        window.SUPABASE_URL || "",
        window.SUPABASE_ANON_KEY || ""
      ]
    ];

    return candidates.find(
      ([url, key]) =>
        typeof url === "string" &&
        typeof key === "string" &&
        url.startsWith("https://") &&
        key.length > 0
    );
  }

  const config = getConfig();

  if (!config || !window.supabase) {
    document.body.innerHTML = `
      <div style="padding:30px;color:white;background:#080b16;
        min-height:100vh;font-family:Arial">
        <h2>Koneksi belum tersedia</h2>
        <p>Periksa config.js dan pastikan Supabase JS berhasil dimuat.</p>
      </div>`;
    return;
  }

  const [SUPABASE_URL, SUPABASE_ANON_KEY] = config;

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  const $ = (id) => document.getElementById(id);

  let currentUser = null;
  let currentProfile = null;
  let tasks = [];
  let announcements = [];

  // ==========================================
  // 2. NOTIFIKASI
  // ==========================================

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function showMessage(element, message, success = false) {
    if (!element) return;

    element.textContent = message;
    element.style.color = success ? "#4ade80" : "#fca5a5";
  }

  function formatDate(value) {
    if (!value) return "Tidak ditentukan";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function getCompletedTasks() {
    if (!currentUser) return [];

    try {
      return JSON.parse(
        localStorage.getItem(
          `completed_tasks_${currentUser.id}`
        ) || "[]"
      );
    } catch {
      return [];
    }
  }

  function isCompleted(taskId) {
    return getCompletedTasks().includes(String(taskId));
  }

  function toggleTask(taskId) {
    const completed = getCompletedTasks();
    const id = String(taskId);

    const updated = completed.includes(id)
      ? completed.filter((item) => item !== id)
      : [...completed, id];

    localStorage.setItem(
      `completed_tasks_${currentUser.id}`,
      JSON.stringify(updated)
    );

    renderTasks();
    updateStats();
  }

  // ==========================================
  // 3. NAVIGASI
  // ==========================================

  const pageIds = {
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

  function openPage(page) {
    if (!pageIds[page]) return;

    if (!currentUser) {
      showLogin();
      return;
    }

    Object.values(pageIds).forEach((id) => {
      const element = $(id);
      if (element) {
        element.hidden = true;
      }
    });

    const target = $(pageIds[page]);

    if (target) target.hidden = false;

    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.page === page
      );
    });

    if ($("pageTitle")) {
      $("pageTitle").textContent = pageTitles[page];
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
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

  // ==========================================
  // 4. TAMPILAN LOGIN
  // ==========================================

  function showLogin() {
    $("loginPage").hidden = false;

    Object.values(pageIds).forEach((id) => {
      const element = $(id);
      if (element) element.hidden = true;
    });

    document.querySelector(".topbar").hidden = true;
  }

  function showDashboard() {
    $("loginPage").hidden = true;
    $("dashboard").hidden = false;
    document.querySelector(".topbar").hidden = false;

    if ($("profileName")) {
      $("profileName").textContent =
        currentProfile?.full_name || currentUser?.email || "Siswa";
    }

    if ($("profileClass")) {
      $("profileClass").textContent =
        currentProfile?.class_name || "XI.A5";
    }

    openPage("home");
  }

  // ==========================================
  // 5. LOGIN SUPABASE
  // ==========================================

  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = $("email").value.trim();
    const password = $("password").value;
    const button = $("loginForm").querySelector(
      'button[type="submit"]'
    );

    showMessage($("
