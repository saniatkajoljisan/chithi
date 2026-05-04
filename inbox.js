// ============================================================
//  js/inbox.js
//  Handles the dashboard — shows messages, copy link, logout
// ============================================================

import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── DOM references ──────────────────────────────────────────
const navUsernameEl  = document.getElementById("nav-username");
const userLinkEl     = document.getElementById("user-link");
const btnCopyLink    = document.getElementById("btn-copy-link");
const copyIcon       = document.getElementById("copy-icon");
const copyText       = document.getElementById("copy-text");
const inboxLoadingEl = document.getElementById("inbox-loading");
const inboxEmptyEl   = document.getElementById("inbox-empty");
const messagesListEl = document.getElementById("messages-list");
const inboxCountEl   = document.getElementById("inbox-count");
const btnLogout      = document.getElementById("btn-logout");
const inboxSearchEl  = document.getElementById("inbox-search");
const inboxFilterEl  = document.getElementById("inbox-filter");
const profileNameEl  = document.getElementById("profile-display-name");
const profileBioEl   = document.getElementById("profile-bio");
const profileAvatarEl= document.getElementById("profile-avatar-preview");
const profileStatusEl= document.getElementById("profile-status");
const btnSaveProfile = document.getElementById("btn-save-profile");

let unsubscribeMessages = null; // Firestore listener cleanup
let currentUser = null;
let currentProfile = null;
let allMessageDocs = [];
let visibleCount = 5;
const allowedFontKeys = new Set([
  "hand-caveat", "hand-patrick", "hand-kalam", "normal"
]);
const allowedBgKeys = new Set([
  "paper", "rose", "mint", "sky"
]);
const reactionChoices = ["heart", "smile", "cry", "spark"];
const reactionLabels = {
  heart: "Love",
  smile: "Smile",
  cry: "Emotional",
  spark: "Angry"
};
const reactionMarks = {
  heart: "❤️",
  smile: "🤣",
  cry: "😭",
  spark: "🤬"
};

// ─── Auth guard ──────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Not logged in → redirect to login
    window.location.href = "login.html";
    return;
  }

  // Load user profile (to get username)
  const profileSnap = await getDoc(doc(db, "users", user.uid));
  if (!profileSnap.exists()) {
    // Profile incomplete → back to signup to choose username
    window.location.href = "signup.html";
    return;
  }

  const profile = profileSnap.data();
  currentUser = user;
  currentProfile = profile;
  const username = profile.username;
  hydrateProfileForm(profile);

  // Update nav
  navUsernameEl.textContent = `@${username}`;

  // Build and display the public link
  const userLink = window.ChithiUrl?.publicUser(username)
    || `${window.location.origin}/user.html?u=${username}`;
  userLinkEl.textContent = userLink;

  // Copy link button
  btnCopyLink.addEventListener("click", () => {
    navigator.clipboard.writeText(userLink).then(() => {
      copyIcon.textContent = "✓";
      copyText.textContent = "Copied!";
      setTimeout(() => {
        copyIcon.textContent = "⎘";
        copyText.textContent = "Copy";
      }, 2000);
    });
  });

  // Load messages
  loadMessages(user.uid);
});

inboxSearchEl?.addEventListener("input", () => { visibleCount = 5; renderMessages(); });
inboxFilterEl?.addEventListener("change", () => { visibleCount = 5; renderMessages(); });
document.querySelectorAll('input[name="avatar-color"]').forEach((option) => {
  option.addEventListener("change", () => {
    if (profileAvatarEl) profileAvatarEl.style.background = option.value;
  });
});
btnSaveProfile?.addEventListener("click", saveProfile);

// ─── Load messages (real-time listener) ──────────────────────
function loadMessages(uid) {
  const q = query(
    collection(db, "messages"),
    where("toUserId", "==", uid)
  );

  // onSnapshot = real-time updates whenever messages change
  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    inboxLoadingEl.classList.add("hidden");

    allMessageDocs = snapshot.docs.slice().sort((a, b) => {
      const aTime = a.data().createdAt?.toMillis?.() || 0;
      const bTime = b.data().createdAt?.toMillis?.() || 0;
      const favDiff = Number(Boolean(b.data().isFavorite)) - Number(Boolean(a.data().isFavorite));
      return favDiff || (bTime - aTime);
    });

    if (snapshot.empty) {
      inboxEmptyEl.classList.remove("hidden");
      messagesListEl.classList.add("hidden");
      inboxCountEl.textContent = "0 letters";
      return;
    }

    inboxEmptyEl.classList.add("hidden");
    messagesListEl.classList.remove("hidden");
    renderMessages();
  }, (err) => {
    console.error("Error loading letters:", err);
    inboxLoadingEl.innerHTML = "<p>Error loading letters. Please refresh.</p>";
  });
}

// ─── Build a single message card ────────────────────────────
function buildMessageCard(docSnap) {
  const msg  = docSnap.data();
  const card = document.createElement("div");
  card.className = `message-card ${bgClass(msg.bgKey)}${msg.isRead ? "" : " unread"}${msg.isFavorite ? " favorite" : ""}`;
  card.dataset.id = docSnap.id;

  // Format date
  const date = msg.createdAt?.toDate
    ? formatDate(msg.createdAt.toDate())
    : "Just now";

  // Sender display
  const senderHTML = msg.isAnonymous
    ? `<span class="anon-badge">🎭 Anonymous</span>`
    : `<span class="message-sender">From <strong>${escapeHtml(msg.senderName || "Someone")}</strong></span>`;

  card.innerHTML = `
    <div class="message-flags">
      ${msg.isFavorite ? `<span class="status-pill">Pinned</span>` : ""}
      ${msg.isReported ? `<span class="status-pill report-pill">Reported</span>` : ""}
      ${msg.isRead ? "" : `<span class="status-pill unread-pill">Unread</span>`}
    </div>
    <div class="message-text ${fontClass(msg.fontKey)}">${escapeHtml(msg.text)}</div>
    ${msg.replyText ? `<div class="reply-card"><span>${escapeHtml(msg.replierName || "You")} replied:</span><p>${escapeHtml(msg.replyText)}</p></div>` : ""}
    <div class="message-meta">
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
        ${senderHTML}
        <span class="message-date">${date}</span>
        ${msg.receiverReaction ? `<span class="reaction-status">${reactionMarks[msg.receiverReaction] || "✦"} ${reactionLabels[msg.receiverReaction] || "Reacted"}</span>` : ""}
      </div>
      <div class="message-actions">
        <button class="btn-card-action btn-toggle-read" data-id="${docSnap.id}">${msg.isRead ? "Unread" : "Read"}</button>
        <button class="btn-card-action btn-favorite" data-id="${docSnap.id}">${msg.isFavorite ? "Unpin" : "Pin"}</button>
        <button class="btn-card-action btn-reply" data-id="${docSnap.id}">Reply</button>
        <button class="btn-card-action btn-share" data-id="${docSnap.id}">Image</button>
        <button class="btn-card-action btn-report" data-id="${docSnap.id}">${msg.isReported ? "Unreport" : "Report"}</button>
        <button class="btn-delete" data-id="${docSnap.id}" title="Delete this letter">Delete</button>
      </div>
    </div>
    <div class="reaction-row" aria-label="Reaction">
      ${reactionChoices.map(key => `
        <button class="reaction-btn ${msg.receiverReaction === key ? "active" : ""}" data-id="${docSnap.id}" data-reaction="${key}" title="${reactionLabels[key]}">
          ${reactionMarks[key]}
        </button>
      `).join("")}
    </div>
  `;

  card.querySelector(".btn-toggle-read").addEventListener("click", () => {
    updateDoc(doc(db, "messages", docSnap.id), { isRead: !Boolean(msg.isRead) });
  });

  card.querySelector(".btn-favorite").addEventListener("click", () => {
    updateDoc(doc(db, "messages", docSnap.id), { isFavorite: !Boolean(msg.isFavorite) });
  });

  card.querySelector(".btn-reply").addEventListener("click", async () => {
    const reply = prompt("Write a public reply for this letter:", msg.replyText || "");
    if (reply === null) return;
    const cleanReply = reply.trim();
    if (cleanReply.length > 280) return alert("Reply is too long. Keep it under 280 characters.");
    await updateDoc(doc(db, "messages", docSnap.id), {
      replyText: cleanReply,
      repliedAt: cleanReply ? serverTimestamp() : null
    });
  });

  card.querySelector(".btn-share").addEventListener("click", () => {
    shareMessageImage(msg);
  });

  card.querySelector(".btn-report").addEventListener("click", async () => {
    if (!msg.isReported && !confirm("Mark this letter as reported?")) return;
    await updateDoc(doc(db, "messages", docSnap.id), { isReported: !Boolean(msg.isReported) });
  });

  card.querySelectorAll(".reaction-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const selected = btn.dataset.reaction;
      await updateDoc(doc(db, "messages", docSnap.id), {
        receiverReaction: msg.receiverReaction === selected ? "" : selected
      });
    });
  });

  // Delete button handler
  card.querySelector(".btn-delete").addEventListener("click", async (e) => {
    const msgId = e.currentTarget.dataset.id;
    if (!confirm("Delete this letter? This can't be undone.")) return;
    try {
      await deleteDoc(doc(db, "messages", msgId));
      // Real-time listener will update the list automatically
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete letter. Please try again.");
    }
  });

  return card;
}

function renderMessages() {
  const search = (inboxSearchEl?.value || "").trim().toLowerCase();
  const filter = inboxFilterEl?.value || "all";
  let docs = allMessageDocs.slice();

  if (filter === "unread") docs = docs.filter(docSnap => !docSnap.data().isRead);
  if (filter === "favorites") docs = docs.filter(docSnap => docSnap.data().isFavorite);
  if (search) {
    docs = docs.filter(docSnap => {
      const msg = docSnap.data();
      return [
        msg.text,
        msg.senderName,
        msg.replyText,
        msg.isAnonymous ? "anonymous" : ""
      ].join(" ").toLowerCase().includes(search);
    });
  }

  // Reset visible count when filter/search changes
  const isFiltered = search || filter !== "all";
  if (isFiltered) visibleCount = docs.length; // show all when searching/filtering
  
  const visible = docs.slice(0, visibleCount);
  const hasMore = docs.length > visibleCount;

  messagesListEl.innerHTML = "";
  visible.forEach(docSnap => messagesListEl.appendChild(buildMessageCard(docSnap)));

  // Load more button
  if (hasMore) {
    const loadMoreBtn = document.createElement("div");
    loadMoreBtn.style.cssText = "display:flex; justify-content:center; margin:1.2rem 0 0.5rem;";
    loadMoreBtn.innerHTML = `
      <button id="btn-load-more" style="
        background: none;
        border: 1.5px solid #e8dcc8;
        border-radius: 999px;
        padding: 0.5rem 1.8rem;
        font-family: 'Lora', serif;
        font-size: 0.85rem;
        color: #8c7a6b;
        cursor: pointer;
        transition: border-color 0.2s, color 0.2s;
      ">Load more letters ↓</button>
    `;
    loadMoreBtn.querySelector("#btn-load-more").addEventListener("mouseenter", e => {
      e.target.style.borderColor = "#c29f7c";
      e.target.style.color = "#2c1e0f";
    });
    loadMoreBtn.querySelector("#btn-load-more").addEventListener("mouseleave", e => {
      e.target.style.borderColor = "#e8dcc8";
      e.target.style.color = "#8c7a6b";
    });
    loadMoreBtn.querySelector("#btn-load-more").addEventListener("click", () => {
      visibleCount += 5;
      renderMessages();
    });
    messagesListEl.appendChild(loadMoreBtn);
  }

  const total = allMessageDocs.length;
  const unread = allMessageDocs.filter(docSnap => !docSnap.data().isRead).length;
  inboxCountEl.textContent = `${total} ${total === 1 ? "letter" : "letters"}${unread ? ` · ${unread} unread` : ""}`;

  if (docs.length === 0 && total > 0) {
    messagesListEl.innerHTML = `<div class="inbox-empty compact"><p>No letters match this view.</p></div>`;
  }
}
function hydrateProfileForm(profile) {
  if (profileNameEl) profileNameEl.value = profile.displayName || profile.username || "";
  if (profileBioEl) profileBioEl.value = profile.bio || "";
  const color = profile.avatarColor || "#2c1e0f";
  const colorOption = document.querySelector(`input[name="avatar-color"][value="${color}"]`);
  if (colorOption) colorOption.checked = true;
  if (profileAvatarEl) {
    const display = profile.displayName || profile.username || "?";
    profileAvatarEl.textContent = display.charAt(0).toUpperCase();
    profileAvatarEl.style.background = color;
  }
}

async function saveProfile() {
  if (!currentUser || !currentProfile) return;
  const displayName = profileNameEl.value.trim() || currentProfile.username;
  const bio = profileBioEl.value.trim();
  const avatarColor = document.querySelector('input[name="avatar-color"]:checked')?.value || "#2c1e0f";

  if (displayName.length > 40) return setProfileStatus("Display name is too long.", true);
  if (bio.length > 90) return setProfileStatus("Bio is too long.", true);

  try {
    await updateDoc(doc(db, "users", currentUser.uid), { displayName, bio, avatarColor });
    currentProfile = { ...currentProfile, displayName, bio, avatarColor };
    navUsernameEl.textContent = `@${currentProfile.username}`;
    hydrateProfileForm(currentProfile);
    setProfileStatus("Profile saved.", false);
  } catch (err) {
    console.error("Profile save error:", err);
    setProfileStatus("Could not save profile. Try again.", true);
  }
}

function setProfileStatus(message, isError) {
  if (!profileStatusEl) return;
  profileStatusEl.textContent = message;
  profileStatusEl.className = `field-status ${isError ? "err" : "ok"}`;
}

async function shareMessageImage(msg) {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  const width  = 1080;
  const height = 1350;
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  drawShareBackground(ctx, width, height, msg.bgKey);

  // Map fontKey to a canvas-safe font that is guaranteed to be loaded
  const fontMap = {
    "hand-caveat":  "54px Caveat, cursive",
    "hand-patrick": "48px 'Patrick Hand', cursive",
    "hand-kalam":   "50px Kalam, cursive",
    "normal":       "44px Lora, Georgia, serif"
  };
  const bodyFont   = fontMap[msg.fontKey] || "54px Caveat, cursive";
  const labelFont  = "34px Kalam, cursive";
  const replyFont  = "38px Kalam, cursive";
  const brandFont  = "32px Kalam, cursive";

  ctx.fillStyle = "#2c1e0f";
  ctx.font = bodyFont;
  wrapCanvasText(ctx, msg.text || "", 90, 190, width - 180, 72, 760);

  ctx.font = labelFont;
  ctx.fillStyle = "rgba(44,30,15,0.68)";
  ctx.fillText(
    msg.isAnonymous ? "Anonymous letter" : `From ${msg.senderName || "Someone"}`,
    90, 1040
  );

  if (msg.replyText) {
    ctx.fillStyle = "rgba(44,30,15,0.9)";
    ctx.font = replyFont;
    ctx.fillText("Reply", 90, 1130);
    ctx.font = labelFont;
    wrapCanvasText(ctx, msg.replyText, 90, 1190, width - 180, 48, 120);
  }

  ctx.font = brandFont;
  ctx.fillStyle = "rgba(44,30,15,0.5)";
  ctx.fillText("Chithi", 90, 1270);

  const link = document.createElement("a");
  link.download = "chithi-letter.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function drawShareBackground(ctx, width, height, bgKey) {
  const colors = {
    paper: ["#fffdf7", "#f7ecd8"],
    rose: ["#fff6f1", "#ffe2dc"],
    mint: ["#f4fff8", "#d9f1df"],
    sky: ["#f5fbff", "#dbeeff"]
  }[allowedBgKeys.has(bgKey) ? bgKey : "paper"];
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(1, colors[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(44,30,15,0.1)";
  for (let y = 150; y < 980; y += 64) {
    ctx.beginPath();
    ctx.moveTo(80, y);
    ctx.lineTo(width - 80, y);
    ctx.stroke();
  }
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxHeight) {
  const words = String(text).split(/\s+/);
  let line = "";
  let currentY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
      if (currentY - y > maxHeight) {
        ctx.fillText("...", x, currentY);
        return;
      }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, currentY);
}

// ─── Logout ──────────────────────────────────────────────────
btnLogout?.addEventListener("click", async () => {
  // Clean up Firestore listener before leaving
  if (unsubscribeMessages) unsubscribeMessages();
  await signOut(auth);
  window.location.href = "index.html";
});

// ─── Helpers ─────────────────────────────────────────────────

/** Format a JS Date into a readable string with relative time and exact date */
function formatDate(date) {
  const now  = new Date();
  const diff = (now - date) / 1000; // seconds

  let relativeTime;
  if (diff < 60)           relativeTime = "Just now";
  else if (diff < 3600)    relativeTime = `${Math.floor(diff / 60)}m ago`;
  else if (diff < 86400)   relativeTime = `${Math.floor(diff / 3600)}h ago`;
  else if (diff < 86400 * 7) relativeTime = `${Math.floor(diff / 86400)}d ago`;
  else relativeTime = date.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  });

  const exactTime = date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });

  return `${relativeTime} (${exactTime})`;
}

/** Prevent XSS by escaping HTML characters */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function fontClass(fontKey) {
  return `font-${allowedFontKeys.has(fontKey) ? fontKey : "hand-caveat"}`;
}
function bgClass(bgKey) {
  return `letter-bg-${allowedBgKeys.has(bgKey) ? bgKey : "paper"}`;
}
