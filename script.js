/* ============================================================
   DATA LAYER
   ============================================================ */
const STORAGE_KEY = "studydesk_v3";
const DEFAULT_DATA = {
  subjects: [], notes: [], plan: [], flashcards: [], quizzes: [], quizScores: [],
  activityDates: [], topicsCompletedManual: 0, hoursStudiedManual: 0,
  profileName: "", birthday: "", lastCheckInDate: null, buddyLog: [], buddyLogDate: null,
};
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_DATA, ...JSON.parse(raw) };
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}
function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
const data = loadData();

function recordActivity() {
  const today = todayStr();
  if (!data.activityDates.includes(today)) data.activityDates.push(today);
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function uid() { return Math.random().toString(36).slice(2, 10); }

const PALETTE = [
  { bg: "var(--blue)", accent: "var(--accent-blue)", icon: "📘" },
  { bg: "var(--sage)", accent: "var(--accent-sage)", icon: "📗" },
  { bg: "var(--lavender)", accent: "var(--accent-lavender)", icon: "📙" },
  { bg: "var(--peach)", accent: "var(--accent-peach)", icon: "📕" },
  { bg: "var(--beige)", accent: "var(--accent-gold)", icon: "📓" },
];
const ICON_OPTIONS = ["📘","🧮","🧪","⚗️","🔬","💻","🌐","📊","📐","🌍","📖","⚖️","💰","🏛️","🎨","🎵"];
const COLOR_OPTIONS = [
  { value: "", label: "Default (grey)" }, { value: "#4A78D4", label: "Blue" }, { value: "#3FA85C", label: "Green" },
  { value: "#8F6FD4", label: "Purple" }, { value: "#D98A3C", label: "Orange" }, { value: "#C15C5C", label: "Red" },
  { value: "#3FA8A0", label: "Teal" }, { value: "#C15C93", label: "Pink" }, { value: "#B8912E", label: "Amber" },
];
function getSubject(id) { return data.subjects.find((s) => s.id === id); }
function styleOf(subject) {
  const fallback = PALETTE[subject.colorIndex % PALETTE.length];
  return { bg: fallback.bg, accent: subject.color || fallback.accent, icon: subject.icon || fallback.icon };
}
const NOTE_TEMPLATES = {
  blank: { label: "Blank", body: "" },
  qa: { label: "Q&A", body: "Q: \nA: \n\nQ: \nA: \n" },
  cornell: { label: "Cornell Notes", body: "Cues:\n\n\nNotes:\n\n\nSummary:\n" },
  lecture: { label: "Lecture / Class Notes", body: "Topic:\nDate:\n\nKey points:\n- \n- \n- \n\nFollow-up questions:\n- \n" },
  summary: { label: "Summary", body: "Main idea:\n\nSupporting points:\n- \n- \n- \n\nConclusion:\n" },
};
function isBirthdayToday() {
  if (!data.birthday) return false;
  const t = new Date(), b = new Date(data.birthday + "T00:00:00");
  return t.getMonth() === b.getMonth() && t.getDate() === b.getDate();
}
function motivationalMessage(pct) {
  if (pct === 100) return "Perfect score! You've truly mastered this material.";
  if (pct >= 80) return "Excellent work — you're really getting the hang of this.";
  if (pct >= 60) return "Good job! A bit more practice and this will be locked in.";
  if (pct >= 40) return "Nice effort — every round like this makes it stick a little more.";
  return "Tough material takes repetition — you showed up and put in the work, and that's what actually builds mastery.";
}
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return days + "d ago";
  return new Date(iso).toLocaleDateString();
}
function formatDuration(sec) {
  const s = Math.round(sec || 0), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/* ============================================================
   UI STATE (not persisted)
   ============================================================ */
const state = {
  active: "home", dark: false, modal: null, confirm: null,
  notesSearch: "", notesSubjectFilter: null, editingNoteId: null,
  timerHandle: null, sessionStart: null,
  flashSession: null, quizSession: null,
  ttsState: "idle",
};
const $ = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const v = (name) => `var(${name})`;
function esc(str) { const d = document.createElement("div"); d.textContent = str ?? ""; return d.innerHTML; }

/* daily resets: buddy log clears each day, doesn't touch any student record */
(function dailyReset() {
  const today = todayStr();
  if (data.buddyLogDate !== today) { data.buddyLog = []; data.buddyLogDate = today; saveData(); }
})();

/* ============================================================
   TOAST
   ============================================================ */
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg;
  $("#toastRoot").appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 2800);
}

/* ============================================================
   MODAL + CONFIRM
   ============================================================ */
function showModal(title, fields, onSubmit, submitLabel) {
  state.modal = { title, fields, onSubmit, submitLabel: submitLabel || "Save" };
  renderModal();
  setTimeout(() => { const f = $(".modal-input"); if (f) f.focus(); }, 30);
}
function closeModal() { state.modal = null; renderModal(); }
function showConfirm(message, onYes, confirmLabel) {
  state.confirm = { message, onYes, confirmLabel: confirmLabel || "Delete" };
  renderModal();
}
function renderModal() {
  const root = $("#modalRoot");
  if (state.confirm) {
    root.innerHTML = `<div class="modal-overlay" data-action="confirm-no"><div class="modal-box" data-action="noop">
      <h3>Are you sure?</h3>
      <p style="font-size:0.85rem;color:var(--charcoal-soft);margin-bottom:18px;">${esc(state.confirm.message)}</p>
      <div class="modal-actions"><button class="btn btn-outline" data-action="confirm-no">Cancel</button>
      <button class="btn btn-primary" style="background:var(--danger)" data-action="confirm-yes">${esc(state.confirm.confirmLabel)}</button></div>
    </div></div>`;
    return;
  }
  if (!state.modal) { root.innerHTML = ""; return; }
  const { title, fields, submitLabel } = state.modal;
  root.innerHTML = `<div class="modal-overlay" data-action="modal-close"><div class="modal-box" data-action="noop">
    <h3>${esc(title)}</h3>
    ${fields.map((f) => {
      if (f.type === "select") {
        return `<label class="modal-label">${esc(f.label)}<select id="mf_${f.name}" class="select" style="margin-top:6px">
          ${f.options.map((o) => `<option value="${esc(o.value)}" ${o.value === f.value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}
        </select></label>`;
      }
      if (f.type === "textarea") {
        return `<label class="modal-label">${esc(f.label)}<textarea id="mf_${f.name}" class="textarea" style="margin-top:6px" placeholder="${esc(f.placeholder || "")}">${esc(f.value || "")}</textarea></label>`;
      }
      return `<label class="modal-label">${esc(f.label)}<input id="mf_${f.name}" class="input modal-input" style="margin-top:6px" type="${f.type || "text"}" placeholder="${esc(f.placeholder || "")}" value="${esc(f.value || "")}" /></label>`;
    }).join("")}
    <div class="modal-actions"><button class="btn btn-outline" data-action="modal-close">Cancel</button>
    <button class="btn btn-primary" data-action="modal-submit">${esc(submitLabel)}</button></div>
  </div></div>`;
}
function submitModal() {
  const { fields, onSubmit } = state.modal;
  const vals = {};
  fields.forEach((f) => { vals[f.name] = $("#mf_" + f.name).value; });
  onSubmit(vals);
  closeModal();
}

/* ============================================================
   THEME + NAV
   ============================================================ */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.dark ? "dark" : "light");
  $("#themeIcon").textContent = state.dark ? "🌙" : "☀️";
  $("#themeLabel").textContent = state.dark ? "Dark Mode" : "Light Mode";
  $("#switchTrack").classList.toggle("on", state.dark);
}
$("#themeToggle").addEventListener("click", () => { state.dark = !state.dark; applyTheme(); });
$("#profileBtn").addEventListener("click", openEditProfile);

function setActive(id) {
  if (state.active === "editor" && id !== "editor") stopNoteTimer(true);
  state.active = id;
  $all(".nav-item[data-nav]").forEach((b) => b.classList.toggle("active", b.dataset.nav === id));
  renderMain();
}
$all(".nav-item[data-nav]").forEach((b) => b.addEventListener("click", () => setActive(b.dataset.nav)));

function refreshProfileChrome() {
  $("#avatarInitials").textContent = data.profileName ? data.profileName.trim().slice(0, 2).toUpperCase() : "?";
  $("#profileNameLabel").innerHTML = esc(data.profileName || "Add your name") + (isBirthdayToday() ? " 🎂" : "");
}
function openEditProfile() {
  showModal("Your profile", [
    { name: "name", label: "What should StudyDesk call you?", placeholder: "e.g. Dia", value: data.profileName },
    { name: "birthday", label: "Birthday (optional — we'll wish you well)", type: "date", value: data.birthday },
  ], (v) => {
    data.profileName = v.name.trim(); data.birthday = v.birthday || "";
    saveData(); refreshProfileChrome(); renderMain();
  }, "Save");
}

/* ============================================================
   CHATGPT HAND-OFF HELPER
   ============================================================ */
function handOffToChatGPT(prompt, successMsg) {
  if (navigator.clipboard) navigator.clipboard.writeText(prompt).catch(() => {});
  window.open("https://chatgpt.com/", "_blank");
  toast(successMsg || "Copied — paste it into ChatGPT!");
}
function buildNotesContext(filterFn, limit) {
  const filtered = (filterFn ? data.notes.filter(filterFn) : data.notes).slice(0, limit || 10);
  if (!filtered.length) return "";
  return filtered.map((n) => `"${n.heading || "Untitled Note"}": ${(n.body || "").slice(0, 500)}`).join("\n\n");
}

/* ============================================================
   SUBJECTS / TOPICS
   ============================================================ */
function openAddSubjectModal(cb) {
  showModal("Add a subject", [{ name: "name", label: "Subject name", placeholder: "e.g. Organic Chemistry" }], (v) => {
    const name = v.name.trim(); if (!name) return;
    const subject = { id: uid(), name, colorIndex: data.subjects.length, icon: null, color: null, topics: [] };
    data.subjects.push(subject); recordActivity(); saveData(); renderMain();
    if (cb) cb(subject);
  }, "Add Subject");
}
function openCustomizeSubjectModal(subjectId) {
  const s = getSubject(subjectId); const style = styleOf(s);
  showModal("Customize " + s.name, [
    { name: "icon", label: "Icon", type: "select", value: style.icon, options: ICON_OPTIONS.map((i) => ({ value: i, label: i })) },
    { name: "color", label: "Color", type: "select", value: s.color || "", options: COLOR_OPTIONS },
  ], (v) => { s.icon = v.icon; s.color = v.color || null; saveData(); renderMain(); }, "Save");
}
function openAddTopicModal(subjectId) {
  showModal("Add a topic", [{ name: "name", label: "Topic name", placeholder: "e.g. Integration by Parts" }], (v) => {
    const name = v.name.trim(); if (!name) return;
    getSubject(subjectId).topics.push({ id: uid(), name, percent: 0, lastTouched: null });
    recordActivity(); saveData(); renderMain();
  }, "Add Topic");
}
function bumpTopic(subjectId, topicId) {
  const t = getSubject(subjectId).topics.find((x) => x.id === topicId);
  t.percent = Math.min(100, t.percent + 10); t.lastTouched = new Date().toISOString();
  recordActivity(); saveData(); renderMain();
}
function deleteSubject(subjectId) {
  showConfirm("Remove this subject? Its topics will be removed too.", () => {
    data.subjects = data.subjects.filter((s) => s.id !== subjectId);
    data.notes.forEach((n) => { if (n.subjectId === subjectId) { n.subjectId = null; n.topicId = null; } });
    data.flashcards = data.flashcards.filter((c) => c.subjectId !== subjectId);
    data.quizzes = data.quizzes.filter((q) => q.subjectId !== subjectId);
    saveData(); renderMain();
  });
}

/* ============================================================
   PLAN
   ============================================================ */
function openAddPlanModal() {
  showModal("Add to today's plan", [
    { name: "time", label: "Time", placeholder: "e.g. 4:00 PM" },
    { name: "task", label: "Task", placeholder: "What will you study?" },
    { name: "subjectId", label: "Subject", type: "select", options: [{ value: "", label: "No subject" }, ...data.subjects.map((s) => ({ value: s.id, label: s.name }))] },
  ], (v) => {
    if (!v.task.trim()) return;
    data.plan.push({ id: uid(), time: v.time.trim() || "—", task: v.task.trim(), subjectId: v.subjectId || null, done: false });
    recordActivity(); saveData(); renderMain();
  }, "Add Task");
}
function togglePlan(id) { const p = data.plan.find((x) => x.id === id); p.done = !p.done; saveData(); renderMain(); }
function deletePlan(id) { data.plan = data.plan.filter((p) => p.id !== id); saveData(); renderMain(); }

/* ============================================================
   NOTES + EDITOR
   ============================================================ */
function createNote(opts = {}) {
  const note = { id: uid(), heading: opts.heading || "", body: opts.body || "", subjectId: opts.subjectId || null, topicId: null, pdfName: opts.pdfName || null, timeSpent: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  data.notes.unshift(note); recordActivity(); saveData();
  return note;
}
function startNewNote() {
  showModal("New note", [{ name: "template", label: "Start from a template", type: "select", value: "blank", options: Object.entries(NOTE_TEMPLATES).map(([k, t]) => ({ value: k, label: t.label })) }], (v) => {
    const tpl = NOTE_TEMPLATES[v.template] || NOTE_TEMPLATES.blank;
    const n = createNote({ body: tpl.body });
    openNoteEditor(n.id);
  }, "Create");
}
function openNoteEditor(id) {
  state.editingNoteId = id; state.active = "editor";
  $all(".nav-item[data-nav]").forEach((b) => b.classList.remove("active"));
  startNoteTimer(); renderMain();
  setTimeout(() => { const h = $("#editorHeading"); if (h) h.focus(); }, 30);
}
function startNoteTimer() {
  state.sessionStart = Date.now();
  clearInterval(state.timerHandle);
  state.timerHandle = setInterval(updateTimerDisplay, 1000);
}
function updateTimerDisplay() {
  const el = $("#editorTimer"); if (!el) { clearInterval(state.timerHandle); return; }
  const note = data.notes.find((n) => n.id === state.editingNoteId);
  el.textContent = "⏱ " + formatDuration((note ? note.timeSpent || 0 : 0) + (Date.now() - state.sessionStart) / 1000);
}
function stopNoteTimer(save) {
  clearInterval(state.timerHandle);
  if (!state.editingNoteId) return;
  const note = data.notes.find((n) => n.id === state.editingNoteId);
  if (!note) return;
  note.timeSpent = (note.timeSpent || 0) + (Date.now() - state.sessionStart) / 1000;
  note.updatedAt = new Date().toISOString();
  if (save) {
    const h = $("#editorHeading"), b = $("#editorBody");
    if (h) note.heading = h.value.trim() || "Untitled Note";
    if (b) note.body = b.value;
    if (!note.body.trim() && !note.pdfName && note.timeSpent < 2 && (!note.heading || note.heading === "Untitled Note")) {
      data.notes = data.notes.filter((n) => n.id !== note.id);
    }
    recordActivity(); saveData();
  }
  state.editingNoteId = null;
}
function autosaveEditorFields() {
  // Lightweight save-in-place while still editing — does NOT stop the timer,
  // clear editingNoteId, or run the empty-note cleanup (that's stopNoteTimer's job).
  if (!state.editingNoteId) return;
  const note = data.notes.find((n) => n.id === state.editingNoteId);
  if (!note) return;
  const h = $("#editorHeading"), b = $("#editorBody");
  if (h) note.heading = h.value;
  if (b) note.body = b.value;
  note.updatedAt = new Date().toISOString();
  saveData();
}
function closeEditor() { stopNoteTimer(true); setActive("notes"); }
function deleteCurrentNote() {
  showConfirm("Delete this note? This can't be undone.", () => {
    clearInterval(state.timerHandle);
    data.notes = data.notes.filter((n) => n.id !== state.editingNoteId);
    state.editingNoteId = null; saveData(); setActive("notes");
  });
}
$("#pdfInput").addEventListener("change", (e) => {
  const file = e.target.files[0]; if (!file) return;
  const n = createNote({ heading: file.name.replace(/\.pdf$/i, ""), pdfName: file.name, body: "" });
  openNoteEditor(n.id);
  toast("PDF attached — add your own notes about it below.");
  e.target.value = "";
});

/* ============================================================
   RENDER: HOME
   ============================================================ */
function renderHome() {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const streak = computeStreak();
  const birthday = isBirthdayToday();
  const name = data.profileName;

  let dynamicMessage;
  if (birthday) {
    dynamicMessage = name ? `Wishing you a wonderful birthday, ${name} — enjoy your day! 🎂` : "Wishing you a wonderful birthday — enjoy your day! 🎂";
  } else {
    const pendingTasks = data.plan.filter((p) => !p.done).length;
    const today = todayStr();
    const notesToday = data.notes.filter((n) => (n.updatedAt || "").slice(0, 10) === today).length;
    const totalTopics = data.subjects.reduce((s, sub) => s + sub.topics.length, 0);
    const openTopics = data.subjects.reduce((s, sub) => s + sub.topics.filter((t) => t.percent < 100).length, 0);
    if (data.subjects.length === 0) dynamicMessage = "Add your first subject below to start tracking real progress.";
    else if (streak >= 3) dynamicMessage = `You're on a ${streak}-day streak — keep the momentum going.`;
    else if (notesToday > 0) dynamicMessage = `Nice work — you've added ${notesToday} note${notesToday > 1 ? "s" : ""} today already.`;
    else if (pendingTasks > 0) dynamicMessage = `You have ${pendingTasks} task${pendingTasks > 1 ? "s" : ""} left on today's plan.`;
    else if (totalTopics > 0 && openTopics === 0) dynamicMessage = "Every topic you've added is fully complete — add a new one to keep going.";
    else if (openTopics > 0) dynamicMessage = `${openTopics} topic${openTopics > 1 ? "s" : ""} still in progress — pick one up where you left off.`;
    else {
      const fallbacks = ["Small consistent sessions beat cramming.", "Ready to learn something new?", "A little progress each day adds up.", "Pick one topic and give it ten focused minutes."];
      dynamicMessage = fallbacks[Math.floor(Date.now() / 86400000) % fallbacks.length];
    }
  }

  const banner = birthday ? `<div class="card pad-lg birthday-banner view-enter"><div style="font-size:30px">🎉🎂🎉</div><h2 style="margin:6px 0 4px">Happy Birthday${name ? ", " + esc(name) : ""}!</h2><p style="font-size:0.85rem;color:var(--charcoal-soft)">Take it a little easier on the studying today — you've earned it.</p></div>` : "";

  const statCards =
    `<div class="card pad stagger"><div class="icon-bubble" style="width:38px;height:38px;background:${v("--peach")};font-size:17px">🔥</div><div class="stat-value">${streak}</div><div class="stat-label">Day Streak</div></div>` +
    `<div class="card pad stagger"><div class="icon-bubble" style="width:38px;height:38px;background:${v("--blue")};font-size:17px">📚</div><div class="stat-value">${data.topicsCompletedManual || 0}</div><div class="stat-label">Topics Completed</div><button class="stat-edit" data-action="edit-topics-stat">✎ Edit</button></div>` +
    `<div class="card pad stagger"><div class="icon-bubble" style="width:38px;height:38px;background:${v("--sage")};font-size:17px">⏱️</div><div class="stat-value">${Number(data.hoursStudiedManual || 0).toFixed(1)}</div><div class="stat-label">Hours Studied</div><button class="stat-edit" data-action="edit-hours-stat">✎ Edit</button></div>` +
    `<div class="card pad stagger"><div class="icon-bubble" style="width:38px;height:38px;background:${v("--lavender")};font-size:17px">🎯</div><div class="stat-value">${avgQuizScore() === null ? "—" : avgQuizScore() + "%"}</div><div class="stat-label">Avg Quiz Score</div><button class="stat-edit" data-action="log-score">✎ Log a score</button></div>`;

  let learning;
  if (data.subjects.length === 0) {
    learning = `<div class="empty"><div class="empty-icon">📚</div><p>No subjects yet. Add one to start tracking topics and progress.</p><button class="btn btn-primary" data-action="add-subject">+ Enter Subject</button></div>`;
  } else {
    learning = data.subjects.map((s) => {
      const style = styleOf(s);
      const avg = s.topics.length ? Math.round(s.topics.reduce((a, t) => a + t.percent, 0) / s.topics.length) : 0;
      const topics = s.topics.length ? s.topics.map((t) =>
        `<div class="topic-row"><span class="topic-name">${esc(t.name)}</span><div class="progress-track"><div class="progress-fill" style="width:${t.percent}%;background:${style.accent}"></div></div><span class="topic-pct">${t.percent}%</span>` +
        (t.percent >= 100 ? `<span style="font-size:0.75rem;color:var(--accent-sage);font-weight:600">✓ Done</span>` : `<button class="btn btn-sm" style="background:var(--beige);color:var(--accent-gold)" data-action="bump-topic" data-subject="${s.id}" data-topic="${t.id}">+10%</button>`) +
        `</div>`).join("") : `<p style="font-size:0.8rem;color:var(--charcoal-soft)">No topics yet.</p>`;
      return `<div class="card pad subject-block"><div class="subject-block-head">
          <div class="icon-bubble" style="width:32px;height:32px;background:${style.bg};font-size:15px">${style.icon}</div>
          <span style="font-weight:600;flex:1">${esc(s.name)}</span><span style="font-size:0.75rem;color:var(--charcoal-soft)">${avg}% avg</span>
          <button class="btn btn-outline btn-sm" data-action="customize-subject" data-target="${s.id}">🎨</button>
          <button class="btn btn-danger btn-sm" data-action="delete-subject" data-target="${s.id}">✕</button>
        </div>${topics}<button class="btn-sm" style="color:var(--accent-electric);font-weight:600;margin-top:6px" data-action="add-topic" data-target="${s.id}">+ Add Topic</button></div>`;
    }).join("");
  }

  const quickActions =
    `<button class="card quick-action" data-action="new-note"><span style="font-size:20px">📝</span><span style="font-size:0.82rem;font-weight:500">New Note</span></button>` +
    `<button class="card quick-action" data-action="upload-pdf"><span style="font-size:20px">📄</span><span style="font-size:0.82rem;font-weight:500">Upload PDF</span></button>` +
    `<button class="card quick-action" data-action="go-buddy"><span style="font-size:20px">🤖</span><span style="font-size:0.82rem;font-weight:500">Ask AI</span></button>` +
    `<button class="card quick-action" data-action="go-quizzes"><span style="font-size:20px">🧠</span><span style="font-size:0.82rem;font-weight:500">Quizzes</span></button>`;

  const recentNotes = data.notes.slice(0, 5);
  const notesHtml = recentNotes.length ? recentNotes.map((n) => {
    const subject = n.subjectId ? getSubject(n.subjectId) : null; const style = subject ? styleOf(subject) : null;
    return `<div class="note-row" data-action="open-note" data-target="${n.id}"><div class="icon-bubble" style="width:30px;height:30px;background:${style ? style.bg : v("--beige")};font-size:14px">${style ? style.icon : "📝"}</div>
      <div style="flex:1;min-width:0"><div style="font-weight:500;font-size:0.87rem">${esc(n.heading || "Untitled Note")}</div>
      <div style="font-size:0.72rem;color:var(--charcoal-soft)">${subject ? esc(subject.name) : "No subject"} · ${timeAgo(n.updatedAt)}${n.pdfName ? " · 📎 " + esc(n.pdfName) : ""}</div></div></div>`;
  }).join("") : `<div class="empty"><div class="empty-icon">🗒️</div><p>No notes yet — create your first note.</p><button class="btn btn-primary" data-action="new-note">+ New Note</button></div>`;

  const planHtml = data.plan.length ? data.plan.map((p) => {
    const subject = p.subjectId ? getSubject(p.subjectId) : null;
    return `<div class="plan-row ${p.done ? "done" : ""}"><button class="plan-check" data-action="toggle-plan" data-target="${p.id}">${p.done ? "✓" : ""}</button>
      <span class="plan-time">${esc(p.time)}</span><span class="plan-task" style="flex:1;font-size:0.85rem;font-weight:500">${esc(p.task)}${subject ? ` <span style="color:var(--charcoal-soft)">· ${esc(subject.name)}</span>` : ""}</span>
      <button style="font-size:0.8rem;color:var(--charcoal-soft)" data-action="delete-plan" data-target="${p.id}">✕</button></div>`;
  }).join("") : `<div class="empty"><div class="empty-icon">📅</div><p>No plan yet — add your first study task.</p></div>`;

  $("#main").innerHTML = `<div class="view-enter">
    ${banner}
    <div class="page-head"><h1 class="page-title">${birthday ? "🎂 " : ""}${timeGreeting}${name ? `, ${esc(name)}` : ""} 👋</h1>
    ${!name ? `<button class="stat-edit" style="margin-top:4px" data-action="edit-profile">✎ Add your name</button>` : ""}
    <p class="page-sub">${data.activityDates.includes(todayStr()) ? '<span class="pulse-dot"></span>' : ""}${esc(dynamicMessage)}</p></div>
    <div class="section"><div class="grid grid-4">${statCards}</div></div>
    <div class="section"><div class="section-head"><h2 class="section-title">Continue Learning</h2>${data.subjects.length > 0 ? `<button class="btn btn-outline btn-sm" data-action="add-subject">+ Enter Subject</button>` : ""}</div>${learning}</div>
    <div class="section"><h2 class="section-title" style="margin-bottom:14px">Quick Actions</h2><div class="grid grid-4">${quickActions}</div></div>
    <div class="home-bottom">
      <div class="card pad-lg"><h2 class="section-title" style="margin-bottom:14px">Recent Notes</h2>${notesHtml}</div>
      <div class="card pad-lg"><div class="section-head" style="margin-bottom:12px"><h2 class="section-title">Today's Study Plan</h2><button class="btn btn-outline btn-sm" data-action="add-plan">+ Add</button></div>${planHtml}</div>
    </div>
  </div>`;
}
function computeStreak() {
  const set = new Set(data.activityDates); let streak = 0; let c = new Date();
  if (!set.has(c.toISOString().slice(0, 10))) c.setDate(c.getDate() - 1);
  while (set.has(c.toISOString().slice(0, 10))) { streak++; c.setDate(c.getDate() - 1); }
  return streak;
}
function avgQuizScore() { return data.quizScores.length ? Math.round(data.quizScores.reduce((s, q) => s + q.score, 0) / data.quizScores.length) : null; }

/* ============================================================
   RENDER: NOTES
   ============================================================ */
function renderNotes() {
  let notes = data.notes;
  if (state.notesSubjectFilter) notes = notes.filter((n) => n.subjectId === state.notesSubjectFilter);
  if (state.notesSearch.trim()) { const q = state.notesSearch.toLowerCase(); notes = notes.filter((n) => (n.heading || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q)); }

  const chips = `<button class="chip ${!state.notesSubjectFilter ? "active" : ""}" data-action="filter-subject" data-target="">All (${data.notes.length})</button>` +
    data.subjects.map((s) => `<button class="chip ${state.notesSubjectFilter === s.id ? "active" : ""}" data-action="filter-subject" data-target="${s.id}">${esc(s.name)} (${data.notes.filter((n) => n.subjectId === s.id).length})</button>`).join("") +
    `<button class="chip" data-action="add-subject">+ Add Subject</button>`;

  const notesHtml = notes.length ? `<div class="grid grid-3">${notes.map((n) => {
    const subject = n.subjectId ? getSubject(n.subjectId) : null; const style = subject ? styleOf(subject) : null;
    return `<div class="card note-card" data-action="open-note" data-target="${n.id}">
      <button class="btn btn-danger btn-sm note-card-del" data-action="delete-note-direct" data-target="${n.id}">✕</button>
      <div class="note-card-title">${esc(n.heading || "Untitled Note")}</div>
      <div class="note-card-meta">${subject ? `<span class="pill" style="background:${style.bg};color:${style.accent}">${esc(subject.name)}</span>` : `<span class="pill" style="background:var(--beige)">No subject</span>`}
      <span>${timeAgo(n.updatedAt)}</span><span>⏱ ${formatDuration(n.timeSpent)}</span>${n.pdfName ? `<span>📎 ${esc(n.pdfName)}</span>` : ""}</div>
      ${n.body ? `<div class="note-card-preview">${esc(n.body)}</div>` : ""}</div>`;
  }).join("")}</div>` : `<div class="empty"><div class="empty-icon">🗒️</div><p>${data.notes.length === 0 ? "No notes yet — create your first note." : "No notes match your search/filter."}</p><button class="btn btn-primary" data-action="new-note">+ New Note</button></div>`;

  $("#main").innerHTML = `<div class="view-enter">
    <div class="page-head"><h1 class="page-title">My Notes</h1><p class="page-sub">Real study time tracked per note.</p></div>
    <div class="toolbar"><div class="search-box">🔍<input id="notesSearchInput" placeholder="Search notes..." value="${esc(state.notesSearch)}" /></div>
      <button class="btn btn-primary" data-action="new-note">+ New Note</button>
      <button class="btn btn-outline" data-action="upload-pdf">⬆️ Upload PDF</button></div>
    <div class="chips-row">${chips}</div>${notesHtml}</div>`;
}

/* ============================================================
   RENDER: EDITOR
   ============================================================ */
function renderEditor() {
  const note = data.notes.find((n) => n.id === state.editingNoteId);
  if (!note) { setActive("notes"); return; }
  const currentSubject = note.subjectId ? getSubject(note.subjectId) : null;
  const subjectOptions = [`<option value="">No subject</option>`, ...data.subjects.map((s) => `<option value="${s.id}" ${s.id === note.subjectId ? "selected" : ""}>${esc(s.name)}</option>`), `<option value="__new__">+ New subject...</option>`].join("");
  const topicOptions = currentSubject ? [`<option value="">No topic</option>`, ...currentSubject.topics.map((t) => `<option value="${t.id}" ${t.id === note.topicId ? "selected" : ""}>${esc(t.name)}</option>`), `<option value="__new__">+ New topic...</option>`].join("") : `<option value="">Pick a subject first</option>`;

  $("#main").innerHTML = `<div class="view-enter">
    <div class="editor-top"><button class="btn btn-outline" data-action="editor-close">← Back to Notes</button><span class="editor-timer" id="editorTimer">⏱ ${formatDuration(note.timeSpent)}</span></div>
    <input id="editorHeading" class="editor-heading" placeholder="Note title..." value="${esc(note.heading)}" />
    ${note.pdfName ? `<div class="editor-attachment">📎 ${esc(note.pdfName)}</div>` : ""}
    <div class="editor-meta-row">
      <select id="editorSubject" class="select" style="width:auto">${subjectOptions}</select>
      <select id="editorTopic" class="select" style="width:auto" ${!currentSubject ? "disabled" : ""}>${topicOptions}</select>
    </div>
    <textarea id="editorBody" class="textarea editor-body" placeholder="Start writing your notes here...">${esc(note.body)}</textarea>
    <div class="editor-actions"><button class="btn btn-danger" data-action="editor-delete">🗑 Delete Note</button><button class="btn btn-primary" data-action="editor-close">✓ Save &amp; Close</button></div>
  </div>`;

  $("#editorSubject").addEventListener("change", (e) => {
    if (e.target.value === "__new__") { openAddSubjectModal((s) => { note.subjectId = s.id; note.topicId = null; saveData(); renderEditor(); }); return; }
    note.subjectId = e.target.value || null; note.topicId = null; saveData(); renderEditor();
  });
  $("#editorTopic").addEventListener("change", (e) => {
    if (e.target.value === "__new__") { openAddTopicModal(note.subjectId); return; }
    note.topicId = e.target.value || null; saveData();
  });
}

/* ============================================================
   RENDER: AI BUDDY (ChatGPT hand-off + deterministic reminder)
   ============================================================ */
function renderBuddy() {
  let reminder = "";
  let stalest = null, stalestDays = -1;
  data.subjects.forEach((s) => s.topics.forEach((t) => {
    if (t.percent >= 100) return;
    const days = t.lastTouched ? Math.floor((Date.now() - new Date(t.lastTouched).getTime()) / 86400000) : 9999;
    if (days > stalestDays) { stalestDays = days; stalest = { subject: s, topic: t, days }; }
  }));
  if (stalest && stalestDays >= 3) {
    const text = stalest.days >= 9999
      ? `You haven't started reviewing "${stalest.topic.name}" in ${stalest.subject.name} yet.`
      : `It's been ${stalest.days} days since you touched "${stalest.topic.name}" in ${stalest.subject.name}.`;
    reminder = `<div class="card pad reminder-card" style="margin-bottom:18px"><b>💡 Quick check-in</b><p style="font-size:0.85rem;margin-top:4px">${text} Want a quick recap? Try "Explain a topic" below.</p></div>`;
  }

  const modes = [
    { icon: "✨", label: "Explain a topic", action: "mode-explain" },
    { icon: "📄", label: "Summarize a subject", action: "mode-summarize" },
    { icon: "🗺️", label: "Mind map a subject", action: "mode-mindmap" },
    { icon: "🔍", label: "Ask about a note", action: "mode-note" },
    { icon: "✅", label: "Quizzes", action: "go-quizzes" },
    { icon: "🃏", label: "Flashcards", action: "go-flashcards" },
  ];
  const modeCards = modes.map((m) => `<button class="card mode-card" data-action="${m.action}"><span>${m.icon}</span><span style="font-size:0.85rem;font-weight:500">${m.label}</span></button>`).join("");

  const log = data.buddyLog.length ? data.buddyLog.slice().reverse().map((l) => `<div class="log-item">${esc(l.text)}<div class="log-meta">${timeAgo(l.date)} · opened in ChatGPT</div></div>`).join("") : `<p style="font-size:0.82rem;color:var(--charcoal-soft)">Nothing yet today — pick a mode above to get started.</p>`;

  $("#main").innerHTML = `<div class="view-enter">
    <div class="page-head"><h1 class="page-title">Hi! I'm your Study Buddy 🤖</h1><p class="page-sub">Pick a mode — I'll build a question from your real notes and hand it to ChatGPT.</p></div>
    ${reminder}
    <div class="grid grid-3" style="margin-bottom:18px">${modeCards}</div>
    <div class="card pad-lg"><h3 style="margin-bottom:10px;font-size:0.95rem">Today's activity</h3><div class="log-feed">${log}</div></div>
  </div>`;
}
function logBuddy(text) { data.buddyLog.push({ text, date: new Date().toISOString() }); saveData(); }
function modeExplain() {
  const flat = []; data.subjects.forEach((s) => s.topics.forEach((t) => flat.push({ value: s.id + "::" + t.id, label: s.name + " — " + t.name })));
  if (!flat.length) { toast("Add a topic to a subject first."); return; }
  showModal("Explain a topic", [{ name: "topic", label: "Which topic?", type: "select", options: flat }], (v) => {
    const [sid, tid] = v.topic.split("::"); const s = getSubject(sid); const t = s.topics.find((x) => x.id === tid);
    const prompt = `Explain "${t.name}" from ${s.name} in a clear, simple way for a student, with an example.`;
    handOffToChatGPT(prompt, "Prompt copied — paste it into ChatGPT!");
    logBuddy(`Asked to explain "${t.name}" (${s.name})`); renderMain();
  }, "Explain");
}
function modeSummarize() {
  if (!data.subjects.length) { toast("Add a subject first."); return; }
  showModal("Summarize notes", [{ name: "subjectId", label: "Which subject?", type: "select", options: data.subjects.map((s) => ({ value: s.id, label: s.name })) }], (v) => {
    const s = getSubject(v.subjectId);
    const notes = buildNotesContext((n) => n.subjectId === s.id, 10);
    if (!notes) { toast("No notes with content yet for " + s.name + "."); return; }
    handOffToChatGPT(`Summarize the following study notes on ${s.name} into concise key points:\n\n${notes}`, "Summary prompt copied — paste it into ChatGPT!");
    logBuddy(`Asked to summarize notes on "${s.name}"`); renderMain();
  }, "Summarize");
}
function modeMindmap() {
  if (!data.subjects.length) { toast("Add a subject first."); return; }
  showModal("Mind map", [{ name: "subjectId", label: "Which subject?", type: "select", options: data.subjects.map((s) => ({ value: s.id, label: s.name })) }], (v) => {
    const s = getSubject(v.subjectId); const topics = s.topics.map((t) => t.name).join(", ") || "the general subject";
    handOffToChatGPT(`Create a text-based mind map (nested outline) for ${s.name}, covering: ${topics}.`, "Mind map prompt copied — paste it into ChatGPT!");
    logBuddy(`Asked for a mind map of "${s.name}"`); renderMain();
  }, "Create");
}
function modeNote() {
  if (!data.notes.length) { toast("No notes yet."); return; }
  showModal("Ask about a note", [
    { name: "noteId", label: "Which note?", type: "select", options: data.notes.map((n) => ({ value: n.id, label: n.heading || "Untitled Note" })) },
    { name: "question", label: "Your question", type: "textarea", placeholder: "e.g. What's the key formula here?" },
  ], (v) => {
    const note = data.notes.find((n) => n.id === v.noteId); const q = v.question.trim(); if (!q) return;
    handOffToChatGPT(`Here are my notes titled "${note.heading}":\n\n${note.body || "(no content yet)"}\n\nQuestion: ${q}`, "Copied — paste it into ChatGPT!");
    logBuddy(`Asked about note "${note.heading}"`); renderMain();
  }, "Ask");
}

/* ============================================================
   RENDER: FLASHCARDS (user-authored, real study session)
   ============================================================ */
function renderFlashcards() {
  if (!data.subjects.length) { $("#main").innerHTML = emptyPage("Flashcards", "Add a subject on Home first.", "🃏"); return; }
  if (state.flashSession) { renderFlashSession(); return; }

  const bySubject = data.subjects.map((s) => {
    const cards = data.flashcards.filter((c) => c.subjectId === s.id);
    return `<div class="card pad" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <span style="font-weight:600">${esc(s.name)} <span style="color:var(--charcoal-soft);font-weight:400;font-size:0.8rem">(${cards.length} cards)</span></span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" data-action="add-flashcard" data-target="${s.id}">+ Add Card</button>
        <button class="btn btn-outline btn-sm" data-action="ask-flashcard-ideas" data-target="${s.id}">✨ Ask ChatGPT</button>
        ${cards.length ? `<button class="btn btn-primary btn-sm" data-action="study-flashcards" data-target="${s.id}">▶ Study</button>` : ""}
      </div></div></div>`;
  }).join("");

  $("#main").innerHTML = `<div class="view-enter">
    <div class="page-head"><h1 class="page-title">Flashcards</h1><p class="page-sub">Build your own cards per subject, or ask ChatGPT for ideas.</p></div>
    ${bySubject}
  </div>`;
}
function openAddFlashcardModal(subjectId) {
  showModal("Add a flashcard", [{ name: "front", label: "Front (question)", placeholder: "e.g. What is the general formula of an aldehyde?" }, { name: "back", label: "Back (answer)", type: "textarea" }], (v) => {
    if (!v.front.trim() || !v.back.trim()) return;
    data.flashcards.push({ id: uid(), subjectId, front: v.front.trim(), back: v.back.trim() });
    recordActivity(); saveData(); renderMain();
  }, "Add Card");
}
function askFlashcardIdeas(subjectId) {
  const s = getSubject(subjectId); const topics = s.topics.map((t) => t.name).join(", ") || "general concepts";
  handOffToChatGPT(`Suggest 6 flashcard question/answer pairs for "${s.name}" covering: ${topics}. Format as "Q: ... / A: ..." so I can copy them into my own flashcards.`, "Prompt copied — paste it into ChatGPT!");
}
function startFlashSession(subjectId) {
  const cards = data.flashcards.filter((c) => c.subjectId === subjectId);
  if (!cards.length) return;
  state.flashSession = { subjectId, cards, i: 0, flipped: false, known: 0, finished: false };
  renderMain();
}
function renderFlashSession() {
  const fs = state.flashSession; const subject = getSubject(fs.subjectId);
  if (fs.finished) {
    const pct = Math.round((fs.known / fs.cards.length) * 100);
    $("#main").innerHTML = `<div style="max-width:480px;margin:0 auto;text-align:center" class="view-enter">
      <div class="card pad-lg">
        <div style="font-size:28px">${pct >= 80 ? "🎉" : pct >= 50 ? "💪" : "🌱"}</div>
        <h2 style="margin:8px 0 4px">${pct >= 80 ? "Deck Mastered!" : pct >= 50 ? "Nice Progress!" : "Good Start!"}</h2>
        <p style="font-size:1.05rem;font-weight:700;color:var(--accent-sage);margin-bottom:8px">${fs.known}/${fs.cards.length} known</p>
        <p style="font-size:0.85rem;color:var(--charcoal-soft);font-style:italic;margin-bottom:16px">${motivationalMessage(pct)}</p>
        <div style="display:flex;justify-content:center;gap:10px">
          <button class="btn btn-outline" data-action="flash-again">↺ Review Again</button>
          <button class="btn btn-primary" data-action="flash-exit">Done</button>
        </div>
      </div></div>`;
    return;
  }
  const card = fs.cards[fs.i];
  $("#main").innerHTML = `<div style="max-width:520px;margin:0 auto;text-align:center" class="view-enter">
    <h1 class="page-title">${esc(subject.name)}</h1>
    <p style="font-size:0.85rem;color:var(--charcoal-soft);margin-bottom:6px">${fs.i + 1} / ${fs.cards.length} · ${fs.known} known</p>
    <div class="flip-card ${fs.flipped ? "flipped" : ""}" data-action="flip-card"><div class="flip-inner">
      <div class="flip-face flip-front">${esc(card.front)}</div><div class="flip-face flip-back">${esc(card.back)}</div>
    </div></div>
    <p style="font-size:0.72rem;color:var(--charcoal-soft);margin-bottom:14px">Click to flip</p>
    <div style="display:flex;justify-content:center;gap:10px">
      <button class="btn btn-sm" style="background:var(--peach);color:var(--accent-peach)" data-action="flash-next" data-target="0">✕ Revise</button>
      <button class="btn btn-sm" style="background:var(--sage);color:var(--accent-sage)" data-action="flash-next" data-target="1">✓ Know it</button>
    </div>
  </div>`;
}

/* ============================================================
   RENDER: QUIZZES (user-authored, real auto-grading)
   ============================================================ */
function renderQuizzes() {
  if (!data.subjects.length) { $("#main").innerHTML = emptyPage("Quizzes", "Add a subject on Home first.", "📝"); return; }
  if (state.quizSession) { renderQuizSession(); return; }

  const bySubject = data.subjects.map((s) => {
    const quiz = data.quizzes.find((q) => q.subjectId === s.id);
    const count = quiz ? quiz.questions.length : 0;
    return `<div class="card pad" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <span style="font-weight:600">${esc(s.name)} <span style="color:var(--charcoal-soft);font-weight:400;font-size:0.8rem">(${count} questions)</span></span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" data-action="add-question" data-target="${s.id}">+ Add Question</button>
        <button class="btn btn-outline btn-sm" data-action="ask-quiz-ideas" data-target="${s.id}">✨ Ask ChatGPT</button>
        ${count ? `<button class="btn btn-primary btn-sm" data-action="take-quiz" data-target="${s.id}">▶ Take Quiz</button>` : ""}
      </div></div></div>`;
  }).join("");

  $("#main").innerHTML = `<div class="view-enter">
    <div class="page-head"><h1 class="page-title">Quizzes</h1><p class="page-sub">Build your own quiz per subject — auto-graded, and scores log to Progress automatically.</p></div>
    ${bySubject}
  </div>`;
}
function openAddQuestionModal(subjectId) {
  showModal("Add a question", [
    { name: "q", label: "Question" },
    { name: "a", label: "Option A" }, { name: "b", label: "Option B" }, { name: "c", label: "Option C" }, { name: "d", label: "Option D" },
    { name: "correct", label: "Correct option", type: "select", options: [{ value: "0", label: "A" }, { value: "1", label: "B" }, { value: "2", label: "C" }, { value: "3", label: "D" }] },
  ], (v) => {
    if (!v.q.trim() || !v.a.trim() || !v.b.trim()) return;
    let quiz = data.quizzes.find((q) => q.subjectId === subjectId);
    if (!quiz) { quiz = { id: uid(), subjectId, questions: [] }; data.quizzes.push(quiz); }
    quiz.questions.push({ id: uid(), q: v.q.trim(), options: [v.a.trim(), v.b.trim(), v.c.trim() || "—", v.d.trim() || "—"], correct: Number(v.correct) });
    recordActivity(); saveData(); renderMain();
  }, "Add Question");
}
function askQuizIdeas(subjectId) {
  const s = getSubject(subjectId); const topics = s.topics.map((t) => t.name).join(", ") || "general concepts";
  handOffToChatGPT(`Suggest 5 multiple-choice quiz questions (with 4 options and the correct answer marked) for "${s.name}" covering: ${topics}.`, "Prompt copied — paste it into ChatGPT!");
}
function startQuizSession(subjectId) {
  const quiz = data.quizzes.find((q) => q.subjectId === subjectId);
  if (!quiz || !quiz.questions.length) return;
  state.quizSession = { subjectId, quiz, step: 0, answers: [], finished: false };
  renderMain();
}
function renderQuizSession() {
  const qs = state.quizSession; const subject = getSubject(qs.subjectId);
  if (qs.finished) {
    const score = qs.answers.filter((a, i) => a === qs.quiz.questions[i].correct).length;
    const pct = Math.round((score / qs.quiz.questions.length) * 100);
    $("#main").innerHTML = `<div style="max-width:480px;margin:0 auto;text-align:center" class="view-enter">
      <div style="font-size:28px">${pct >= 80 ? "🎉" : pct >= 50 ? "💪" : "🌱"}</div>
      <h1 class="page-title">${pct >= 80 ? "Great Work!" : pct >= 50 ? "Solid Effort!" : "Keep Going!"}</h1>
      <p style="font-size:1.15rem;font-weight:700;color:var(--accent-sage);margin:6px 0 8px">Score: ${score}/${qs.quiz.questions.length} — logged to Progress</p>
      <p style="font-size:0.85rem;color:var(--charcoal-soft);font-style:italic;margin-bottom:16px">${motivationalMessage(pct)}</p>
      <div class="card pad-lg" style="text-align:left">${qs.quiz.questions.map((q, i) => `<div style="margin-bottom:12px"><div style="font-size:0.85rem;font-weight:500">${qs.answers[i] === q.correct ? "✅" : "❌"} ${esc(q.q)}</div><div style="font-size:0.78rem;color:var(--charcoal-soft);margin-top:2px">Correct answer: ${esc(q.options[q.correct])}</div></div>`).join("")}</div>
      <button class="btn btn-outline" style="margin-top:16px" data-action="quiz-exit">↺ Back to Quizzes</button>
    </div>`;
    return;
  }
  const q = qs.quiz.questions[qs.step];
  $("#main").innerHTML = `<div style="max-width:480px;margin:0 auto" class="view-enter">
    <div style="font-size:0.85rem;color:var(--charcoal-soft);margin-bottom:8px">${esc(subject.name)} · Question ${qs.step + 1} of ${qs.quiz.questions.length}</div>
    <div class="progress-track" style="margin-bottom:18px"><div class="progress-fill" style="width:${(qs.step / qs.quiz.questions.length) * 100}%;background:var(--accent-electric)"></div></div>
    <div class="card pad-lg"><p style="font-weight:600;font-size:1.05rem;margin-bottom:16px">${esc(q.q)}</p>
      ${q.options.map((o, idx) => `<button class="quiz-option" data-action="quiz-choose" data-target="${idx}">${esc(o)}</button>`).join("")}
    </div>
  </div>`;
}

/* ============================================================
   RENDER: STUDIO (ChatGPT hand-off + real TTS note reading)
   ============================================================ */
function renderStudio() {
  if (!data.subjects.length) { $("#main").innerHTML = emptyPage("Studio", "Add a subject on Home first.", "🎙️"); return; }
  if (!state._studioSubject) state._studioSubject = data.subjects[0].id;
  const subject = getSubject(state._studioSubject);
  const topics = subject.topics.map((t) => t.name).join(", ") || "general concepts";
  const notes = buildNotesContext((n) => n.subjectId === subject.id, 8);

  const blocks = [
    { key: "guide", icon: "📘", title: "Study Guide", prompt: `Write a concise, well-organized study guide for "${subject.name}" (topics: ${topics}).${notes ? " Base it on these notes:\n" + notes : ""} Use plain section labels and simple dashes for lists — no markdown symbols.` },
    { key: "faq", icon: "❓", title: "FAQ", prompt: `Write 6 FAQs with concise answers about "${subject.name}" (topics: ${topics}).${notes ? " Base them on these notes:\n" + notes : ""} Format as plain "Q:" / "A:" lines.` },
    { key: "timeline", icon: "🗓️", title: "Timeline", prompt: `Create a chronological or conceptual-sequence timeline for "${subject.name}" (topics: ${topics}).${notes ? " Base it on these notes:\n" + notes : ""} List each step on its own line with a plain dash.` },
  ];
  const blockHtml = blocks.map((b) => `<div class="card pad-lg studio-block"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:600">${b.icon} ${b.title}</span><button class="btn btn-outline btn-sm" data-action="studio-ask" data-target="${b.key}">✨ Ask ChatGPT</button></div></div>`).join("");

  $("#main").innerHTML = `<div class="view-enter">
    <div class="page-head"><h1 class="page-title">Studio</h1><p class="page-sub">Generate content ideas via ChatGPT, or have your own notes read aloud for real.</p></div>
    <select class="select" id="studioSubjectSelect" style="width:auto;margin-bottom:20px">${data.subjects.map((s) => `<option value="${s.id}" ${s.id === subject.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
    <div class="grid grid-2">
      ${blockHtml}
      <div class="card pad-lg studio-block">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <span style="font-weight:600">🔊 Read My Notes Aloud</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-primary btn-sm" data-action="tts-play">▶ Play</button>
            <button class="btn btn-outline btn-sm" data-action="tts-pause">⏸ Pause</button>
            <button class="btn btn-outline btn-sm" data-action="tts-stop">⏹ Stop</button>
          </div>
        </div>
        <p style="font-size:0.78rem;color:var(--charcoal-soft);margin-top:8px">Reads your actual notes for ${esc(subject.name)} using your browser's built-in voice — genuinely real, no AI script involved.</p>
      </div>
    </div>
  </div>`;

  window._studioBlocks = blocks;
  $("#studioSubjectSelect").addEventListener("change", (e) => { state._studioSubject = e.target.value; window.speechSynthesis.cancel(); renderStudio(); });
}
function ttsPlayNotes() {
  const subject = getSubject(state._studioSubject);
  const notes = data.notes.filter((n) => n.subjectId === subject.id && n.body && n.body.trim());
  if (!notes.length) { toast("No note content yet for " + subject.name + "."); return; }
  window.speechSynthesis.cancel();
  const text = notes.map((n) => (n.heading || "Untitled note") + ". " + n.body).join(". Next note. ");
  const utter = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utter);
  toast("Reading your notes aloud…");
}

/* ============================================================
   RENDER: PROGRESS
   ============================================================ */
function renderProgress() {
  const streak = computeStreak();
  const subjectRows = !data.subjects.length ? `<div class="empty"><p>No subjects yet.</p></div>` : data.subjects.map((s) => {
    const style = styleOf(s); const avg = s.topics.length ? Math.round(s.topics.reduce((a, t) => a + t.percent, 0) / s.topics.length) : 0;
    return `<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--charcoal-soft);margin-bottom:4px"><span>${esc(s.name)} (${s.topics.length} topics)</span><span>${avg}%</span></div><div class="progress-track"><div class="progress-fill" style="width:${avg}%;background:${style.accent}"></div></div></div>`;
  }).join("");

  $("#main").innerHTML = `<div class="view-enter">
    <div class="page-head"><h1 class="page-title">Progress</h1><p class="page-sub">Updates automatically as you add subjects, take quizzes, and study.</p></div>
    <div class="grid grid-4" style="margin-bottom:24px">
      <div class="card pad"><div class="stat-value">${streak}</div><div class="stat-label">Day Streak</div></div>
      <div class="card pad"><div class="stat-value">${data.topicsCompletedManual || 0}</div><div class="stat-label">Topics Completed</div></div>
      <div class="card pad"><div class="stat-value">${Number(data.hoursStudiedManual || 0).toFixed(1)}h</div><div class="stat-label">Study Hours</div></div>
      <div class="card pad"><div class="stat-value">${avgQuizScore() === null ? "—" : avgQuizScore() + "%"}</div><div class="stat-label">Quiz Accuracy</div></div>
    </div>
    <div class="card pad-lg"><h2 class="section-title" style="margin-bottom:14px">Subject Progress</h2>${subjectRows}</div>
  </div>`;
}

function emptyPage(title, msg, icon) {
  return `<div class="view-enter"><div class="page-head"><h1 class="page-title">${title}</h1><p class="page-sub">${msg}</p></div><div class="empty"><div class="empty-icon">${icon}</div><p>No subjects yet.</p><button class="btn btn-primary" data-action="add-subject">+ Enter Subject</button></div></div>`;
}

/* ============================================================
   DISPATCH
   ============================================================ */
const VIEW_RENDERERS = { home: renderHome, notes: renderNotes, editor: renderEditor, buddy: renderBuddy, flashcards: renderFlashcards, quizzes: renderQuizzes, studio: renderStudio, progress: renderProgress };
function renderMain() {
  VIEW_RENDERERS[state.active]();
  refreshProfileChrome();
  if (state.active === "editor") updateTimerDisplay();
}

/* ============================================================
   EVENT DELEGATION
   ============================================================ */
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action, target = el.dataset.target;

  switch (action) {
    case "noop": break;
    case "modal-close": closeModal(); break;
    case "modal-submit": submitModal(); break;
    case "confirm-no": state.confirm = null; renderModal(); break;
    case "confirm-yes": { const fn = state.confirm && state.confirm.onYes; state.confirm = null; renderModal(); if (fn) fn(); break; }

    case "edit-profile": openEditProfile(); break;
    case "add-subject": openAddSubjectModal(); break;
    case "customize-subject": openCustomizeSubjectModal(target); break;
    case "add-topic": openAddTopicModal(target); break;
    case "bump-topic": bumpTopic(el.dataset.subject, el.dataset.topic); break;
    case "delete-subject": deleteSubject(target); break;

    case "add-plan": openAddPlanModal(); break;
    case "toggle-plan": togglePlan(target); break;
    case "delete-plan": deletePlan(target); break;

    case "edit-topics-stat": showModal("Topics completed", [{ name: "value", label: "How many topics have you completed?", type: "number", value: String(data.topicsCompletedManual || 0) }], (v) => { const n = Number(v.value); if (!isNaN(n) && n >= 0) { data.topicsCompletedManual = n; saveData(); renderMain(); } }, "Save"); break;
    case "edit-hours-stat": showModal("Hours studied", [{ name: "value", label: "How many hours have you studied?", type: "number", value: String(data.hoursStudiedManual || 0) }], (v) => { const n = Number(v.value); if (!isNaN(n) && n >= 0) { data.hoursStudiedManual = n; saveData(); renderMain(); } }, "Save"); break;
    case "log-score": showModal("Log a quiz score", [{ name: "score", label: "Score (%)", type: "number", placeholder: "e.g. 85" }], (v) => { const s = Number(v.score); if (isNaN(s) || s < 0 || s > 100) { toast("Enter 0–100."); return; } data.quizScores.push({ id: uid(), score: s, date: new Date().toISOString() }); recordActivity(); saveData(); renderMain(); }, "Log"); break;

    case "new-note": startNewNote(); break;
    case "upload-pdf": $("#pdfInput").click(); break;
    case "go-buddy": setActive("buddy"); break;
    case "go-quizzes": setActive("quizzes"); break;
    case "go-flashcards": setActive("flashcards"); break;
    case "open-note": openNoteEditor(target); break;
    case "delete-note-direct": showConfirm("Delete this note? This can't be undone.", () => { data.notes = data.notes.filter((n) => n.id !== target); saveData(); renderMain(); }); break;
    case "editor-close": closeEditor(); break;
    case "editor-delete": deleteCurrentNote(); break;
    case "filter-subject": state.notesSubjectFilter = target || null; renderMain(); break;

    case "mode-explain": modeExplain(); break;
    case "mode-summarize": modeSummarize(); break;
    case "mode-mindmap": modeMindmap(); break;
    case "mode-note": modeNote(); break;

    case "add-flashcard": openAddFlashcardModal(target); break;
    case "ask-flashcard-ideas": askFlashcardIdeas(target); break;
    case "study-flashcards": startFlashSession(target); break;
    case "flip-card": el.classList.toggle("flipped"); break;
    case "flash-next": {
      const fs = state.flashSession; const gotIt = target === "1";
      if (gotIt) fs.known++;
      if (fs.i >= fs.cards.length - 1) { fs.finished = true; renderMain(); }
      else { fs.i++; fs.flipped = false; renderMain(); }
      break;
    }
    case "flash-again": { const fs = state.flashSession; fs.i = 0; fs.known = 0; fs.finished = false; fs.flipped = false; renderMain(); break; }
    case "flash-exit": state.flashSession = null; renderMain(); break;

    case "add-question": openAddQuestionModal(target); break;
    case "ask-quiz-ideas": askQuizIdeas(target); break;
    case "take-quiz": startQuizSession(target); break;
    case "quiz-choose": {
      const qs = state.quizSession; qs.answers.push(Number(target));
      if (qs.step + 1 < qs.quiz.questions.length) { qs.step++; renderMain(); }
      else {
        qs.finished = true;
        const score = Math.round((qs.answers.filter((a, i) => a === qs.quiz.questions[i].correct).length / qs.quiz.questions.length) * 100);
        data.quizScores.push({ id: uid(), score, subjectId: qs.subjectId, date: new Date().toISOString() });
        recordActivity(); saveData(); renderMain();
      }
      break;
    }
    case "quiz-exit": state.quizSession = null; renderMain(); break;

    case "studio-ask": { const b = window._studioBlocks.find((x) => x.key === target); handOffToChatGPT(b.prompt, "Prompt copied — paste it into ChatGPT!"); break; }
    case "tts-play": ttsPlayNotes(); break;
    case "tts-pause": window.speechSynthesis.pause(); break;
    case "tts-stop": window.speechSynthesis.cancel(); break;
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "notesSearchInput") {
    state.notesSearch = e.target.value; renderMain();
    setTimeout(() => { const i = $("#notesSearchInput"); if (i) { i.focus(); i.selectionStart = i.selectionEnd = i.value.length; } }, 0);
  }
});
document.addEventListener("blur", (e) => { if (e.target && (e.target.id === "editorBody" || e.target.id === "editorHeading")) autosaveEditorFields(); }, true);
window.addEventListener("beforeunload", () => { if (state.active === "editor") stopNoteTimer(true); });

/* ============================================================
   INIT
   ============================================================ */
applyTheme();
refreshProfileChrome();
renderMain();
