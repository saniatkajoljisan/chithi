// ============================================================
//  admin.js
//  Owner-only control panel: browse users, letters, reported
//  letters, and referrals — with delete actions for each.
//
//  Access is gated two ways:
//   1. Client-side check here (redirects non-admins away).
//   2. firestore.rules isAdmin() — the real enforcement, since
//      rule #1 alone could be bypassed by editing the JS.
//
//  NOTE: deleting a user here removes their Firestore data
//  (profile, username reservation, their letters) but does NOT
//  delete their Firebase Auth login — that needs the Admin SDK
//  (a local Node script), which is out of scope for this page.
// ============================================================

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const ADMIN_UID = "yal0GiGvl8Qo43LNp2eMif5wzM52";

// ─── DOM refs ────────────────────────────────────────────────
const loadingEl = document.getElementById("admin-loading");
const gateEl    = document.getElementById("admin-gate");
const mainEl    = document.getElementById("admin-main");

const statUsersEl     = document.getElementById("stat-users");
const statLettersEl   = document.getElementById("stat-letters");
const statReportedEl  = document.getElementById("stat-reported");
const statReferralsEl = document.getElementById("stat-referrals");

const usersListEl     = document.getElementById("users-list");
const lettersListEl   = document.getElementById("letters-list");
const reportedListEl  = document.getElementById("reported-list");
const referralsListEl = document.getElementById("referrals-list");

const usersSearchEl  = document.getElementById("users-search");
const usersSortEl    = document.getElementById("users-sort");
const lettersSearchEl = document.getElementById("letters-search");
const lettersFilterEl = document.getElementById("letters-filter");

const confirmModal = document.getElementById("confirm-modal");
const confirmTitle = document.getElementById("confirm-title");
const confirmBody  = document.getElementById("confirm-body");
const confirmOk    = document.getElementById("confirm-ok");
const confirmCancel = document.getElementById("confirm-cancel");
const confirmBackdrop = document.getElementById("confirm-backdrop");

// ─── In-memory data ─────────────────────────────────────────
let allUsers = [];       // [{ id, ...data }]
let allMessages = [];    // [{ id, ...data }]
let allReferrals = [];   // [{ id, ...data }]
let usersById = {};      // uid -> user data, for cross-referencing

// ─── Auth gate ───────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  if (user.uid !== ADMIN_UID) {
    loadingEl.classList.add("hidden");
    gateEl.classList.remove("hidden");
    return;
  }
  loadingEl.classList.add("hidden");
  mainEl.classList.remove("hidden");
  loadAll();
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

// ─── Load everything ─────────────────────────────────────────
async function loadAll() {
  try {
    const [usersSnap, messagesSnap, referralsSnap] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(query(collection(db, "messages"), orderBy("createdAt", "desc"), limit(500))),
      getDocs(collection(db, "referrals"))
    ]);

    allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allMessages = messagesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allReferrals = referralsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    usersById = {};
    allUsers.forEach(u => { usersById[u.id] = u; });

    renderStats();
    renderUsers();
    renderLetters();
    renderReported();
    renderReferrals();
  } catch (err) {
    console.error("Admin load error:", err);
    mainEl.innerHTML = `<p style="text-align:center;color:var(--red);margin-top:2rem;">
      Could not load admin data. Check console for details.</p>`;
  }
}

function renderStats() {
  statUsersEl.textContent = allUsers.length;
  statLettersEl.textContent = allMessages.length;
  statReportedEl.textContent = allMessages.filter(m => m.isReported).length;
  statReferralsEl.textContent = allReferrals.length;
}

// ─── Tabs ────────────────────────────────────────────────────
document.querySelectorAll(".admin-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".admin-panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
  });
});

// ─── Users tab ───────────────────────────────────────────────
function renderUsers() {
  const term = (usersSearchEl.value || "").trim().toLowerCase();
  const sort = usersSortEl.value;

  let rows = allUsers.filter(u => {
    if (!term) return true;
    return (u.username || "").toLowerCase().includes(term) ||
           (u.email || "").toLowerCase().includes(term);
  });

  rows.sort((a, b) => {
    if (sort === "referrals") return (b.referralCount || 0) - (a.referralCount || 0);
    const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return sort === "oldest" ? at - bt : bt - at;
  });

  if (!rows.length) {
    usersListEl.innerHTML = `<div class="admin-empty">No users match.</div>`;
    return;
  }

  usersListEl.innerHTML = rows.map(u => `
    <div class="admin-row" data-uid="${u.id}">
      <div class="admin-row-main">
        <div class="admin-row-title">
          <strong>${escapeHtml(u.username || "(no username)")}</strong>
          ${u.id === ADMIN_UID ? '<span class="admin-badge read">you</span>' : ""}
        </div>
        <div class="admin-row-sub">
          ${escapeHtml(u.email || "no email")} · joined ${formatTime(u.createdAt)} ·
          ${u.referralCount || 0} referrals · ${escapeHtml(u.referralTier || "Starter")}
        </div>
      </div>
      <div class="admin-row-actions">
        ${u.id === ADMIN_UID ? "" : `<button class="btn-danger btn-sm" data-action="delete-user" data-uid="${u.id}">Delete</button>`}
      </div>
    </div>
  `).join("");
}

usersSearchEl.addEventListener("input", renderUsers);
usersSortEl.addEventListener("change", renderUsers);

// ─── Letters tab ─────────────────────────────────────────────
function renderLetters() {
  const term = (lettersSearchEl.value || "").trim().toLowerCase();
  const filter = lettersFilterEl.value;

  let rows = allMessages.filter(m => {
    if (filter === "unread" && m.isRead) return false;
    if (filter === "read" && !m.isRead) return false;
    if (!term) return true;
    const recipient = usersById[m.toUserId]?.username || "";
    return (m.text || "").toLowerCase().includes(term) ||
           recipient.toLowerCase().includes(term);
  });

  renderMessageRows(rows, lettersListEl);
}

lettersSearchEl.addEventListener("input", renderLetters);
lettersFilterEl.addEventListener("change", renderLetters);

// ─── Reported tab ─────────────────────────────────────────────
function renderReported() {
  const rows = allMessages.filter(m => m.isReported);
  if (!rows.length) {
    reportedListEl.innerHTML = `<div class="admin-empty">No reported letters. 🎉</div>`;
    return;
  }
  renderMessageRows(rows, reportedListEl);
}

// Shared renderer for a list of message docs
function renderMessageRows(rows, containerEl) {
  if (!rows.length) {
    containerEl.innerHTML = `<div class="admin-empty">No letters match.</div>`;
    return;
  }

  containerEl.innerHTML = rows.map(m => {
    const recipient = usersById[m.toUserId]?.username || "(unknown user)";
    const preview = (m.text || "").length > 140 ? m.text.slice(0, 140) + "…" : (m.text || "");
    return `
      <div class="admin-row" data-id="${m.id}">
        <div class="admin-row-main">
          <div class="admin-row-title">
            <span>To <strong>${escapeHtml(recipient)}</strong></span>
            ${m.isReported ? '<span class="admin-badge reported">Reported</span>' : ""}
            <span class="admin-badge ${m.isRead ? "read" : "unread"}">${m.isRead ? "Read" : "Unread"}</span>
          </div>
          <div class="admin-row-sub">${formatTime(m.createdAt)}</div>
          <div class="admin-row-snippet">${escapeHtml(preview)}</div>
        </div>
        <div class="admin-row-actions">
          <button class="btn-danger btn-sm" data-action="delete-message" data-id="${m.id}">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

// ─── Referrals tab ────────────────────────────────────────────
function renderReferrals() {
  if (!allReferrals.length) {
    referralsListEl.innerHTML = `<div class="admin-empty">No referrals yet.</div>`;
    return;
  }

  const rows = [...allReferrals].sort((a, b) => {
    const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return bt - at;
  });

  referralsListEl.innerHTML = rows.map(r => `
    <div class="admin-row" data-id="${r.id}">
      <div class="admin-row-main">
        <div class="admin-row-title">
          <strong>${escapeHtml(r.referrerUsername || "?")}</strong>
          <span style="color:var(--ink-faint);">referred</span>
          <strong>${escapeHtml(r.referredUsername || "?")}</strong>
        </div>
        <div class="admin-row-sub">${formatTime(r.createdAt)} · code ${escapeHtml(r.referrerCode || "")}</div>
      </div>
      <div class="admin-row-actions">
        <button class="btn-danger btn-sm" data-action="delete-referral" data-id="${r.id}">Delete</button>
      </div>
    </div>
  `).join("");
}

// ─── Delete actions (event delegation) ────────────────────────
document.getElementById("admin-main").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  if (action === "delete-user") {
    const uid = btn.dataset.uid;
    const u = usersById[uid];
    askConfirm(
      "Delete this user?",
      `This permanently removes ${u?.username || "this user"}'s profile, username, and all letters sent to them from Firestore. Their login itself is not deleted — see the note in admin.js.`,
      () => deleteUserCascade(uid)
    );
  } else if (action === "delete-message") {
    const id = btn.dataset.id;
    askConfirm("Delete this letter?", "This permanently removes the letter and any reply/reaction on it.", () => deleteMessage(id));
  } else if (action === "delete-referral") {
    const id = btn.dataset.id;
    askConfirm("Delete this referral record?", "This removes the referral link between these two accounts.", () => deleteReferral(id));
  }
});

async function deleteUserCascade(uid) {
  const u = usersById[uid];
  try {
    // Delete every letter addressed to this user
    const theirMessages = allMessages.filter(m => m.toUserId === uid);
    await Promise.all(theirMessages.map(m => deleteDoc(doc(db, "messages", m.id))));

    // Free up their username reservation
    if (u?.username) {
      await deleteDoc(doc(db, "usernames", u.username)).catch(() => {});
    }

    // Remove their own incoming-referral record, if any
    await deleteDoc(doc(db, "referrals", uid)).catch(() => {});

    // Finally remove the profile itself
    await deleteDoc(doc(db, "users", uid));

    allUsers = allUsers.filter(x => x.id !== uid);
    allMessages = allMessages.filter(m => m.toUserId !== uid);
    allReferrals = allReferrals.filter(r => r.id !== uid);
    delete usersById[uid];

    renderStats();
    renderUsers();
    renderLetters();
    renderReported();
    renderReferrals();
  } catch (err) {
    console.error("Delete user error:", err);
    alert("Could not delete this user. Check console for details.");
  }
}

async function deleteMessage(id) {
  try {
    await deleteDoc(doc(db, "messages", id));
    allMessages = allMessages.filter(m => m.id !== id);
    renderStats();
    renderLetters();
    renderReported();
  } catch (err) {
    console.error("Delete message error:", err);
    alert("Could not delete this letter. Check console for details.");
  }
}

async function deleteReferral(id) {
  try {
    await deleteDoc(doc(db, "referrals", id));
    allReferrals = allReferrals.filter(r => r.id !== id);
    renderStats();
    renderReferrals();
  } catch (err) {
    console.error("Delete referral error:", err);
    alert("Could not delete this referral. Check console for details.");
  }
}

// ─── Confirm modal ─────────────────────────────────────────────
let pendingConfirmAction = null;

function askConfirm(title, body, onConfirm) {
  confirmTitle.textContent = title;
  confirmBody.textContent = body;
  pendingConfirmAction = onConfirm;
  confirmModal.classList.add("open");
}
function closeConfirm() {
  confirmModal.classList.remove("open");
  pendingConfirmAction = null;
}
confirmCancel.addEventListener("click", closeConfirm);
confirmBackdrop.addEventListener("click", closeConfirm);
confirmOk.addEventListener("click", async () => {
  const action = pendingConfirmAction;
  closeConfirm();
  if (action) await action();
});

// ─── Tiny helpers ──────────────────────────────────────────────
function formatTime(timestamp) {
  if (!timestamp) return "";
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const day   = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year  = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
