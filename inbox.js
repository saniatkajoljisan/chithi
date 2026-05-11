// ============================================================
//  js/inbox.js
//  Handles the dashboard — shows messages, copy link, logout
// ============================================================

import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  deleteUser,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  writeBatch,
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
const profileEditAvatarEl = document.getElementById("profile-edit-avatar-preview");
const profilePreviewEl = document.getElementById("profile-preview");
const profileEditEl = document.getElementById("profile-edit");
const profilePreviewNameEl = document.getElementById("profile-preview-name");
const profilePreviewBioEl = document.getElementById("profile-preview-bio");
const profileStatusEl= document.getElementById("profile-status");
const btnEditProfile = document.getElementById("btn-edit-profile");
const btnCancelProfile = document.getElementById("btn-cancel-profile");
const btnSaveProfile = document.getElementById("btn-save-profile");
const btnShowDeleteAccount = document.getElementById("btn-show-delete-account");
const btnDeleteAccount = document.getElementById("btn-delete-account");
const btnCancelDeleteAccount = document.getElementById("btn-cancel-delete-account");
const deleteAccountConfirmEl = document.getElementById("account-delete-confirm");
const deleteAccountInputEl = document.getElementById("delete-account-input");
const deleteAccountStatusEl = document.getElementById("delete-account-status");

let unsubscribeMessages = null; // Firestore listener cleanup
let currentUser = null;
let currentProfile = null;
let allMessageDocs = [];
let visibleCount = 5;
const expandedReportedIds = new Set();
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
    updateProfileAvatarPreview(option.value);
  });
});
btnSaveProfile?.addEventListener("click", saveProfile);
btnEditProfile?.addEventListener("click", showProfileEdit);
btnCancelProfile?.addEventListener("click", cancelProfileEdit);
btnShowDeleteAccount?.addEventListener("click", showDeleteAccountConfirm);
btnCancelDeleteAccount?.addEventListener("click", cancelDeleteAccountConfirm);
btnDeleteAccount?.addEventListener("click", handleDeleteAccount);

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
  card.dataset.id = docSnap.id;

  if (msg.isReported && !expandedReportedIds.has(docSnap.id)) {
    return buildReportedPreview(docSnap, card, msg);
  }

  // Unread letters → show as collapsed "tap to open" notification strip
  if (!msg.isRead) {
    return buildUnreadPreview(docSnap, card, msg);
  }

  // Already-read letters → render full expanded card
  return buildExpandedCard(docSnap, card, msg);
}

// ─── Unread preview strip (collapsed, tap to open) ───────────
function buildUnreadPreview(docSnap, card, msg) {
  const date = msg.createdAt?.toDate
    ? formatDate(msg.createdAt.toDate())
    : "Just now";

  const preview = escapeHtml((msg.text || "").slice(0, 10)) + ((msg.text || "").length > 10 ? "…" : "");

  card.className = `msg-preview-strip ${bgClass(msg.bgKey)}${msg.isFavorite ? " favorite" : ""}`;

  card.innerHTML = `
    <div class="msg-preview-inner">
      <div class="msg-preview-left">
        <span class="msg-preview-dot" aria-label="New letter"></span>
        <div class="msg-preview-info">
          <span class="msg-preview-from">
            ${msg.isAnonymous
              ? `<span class="anon-badge" style="font-size:0.8rem;">🎭 Anonymous</span>`
              : `<strong>${escapeHtml(msg.senderName || "Someone")}</strong>`}
            <span class="msg-preview-label">sent you a letter</span>
          </span>
          <span class="msg-preview-snippet ${fontClass(msg.fontKey)}">${preview}</span>
        </div>
      </div>
      <div class="msg-preview-right">
        <span class="msg-preview-time">${date.split(" (")[0]}</span>
        <span class="msg-preview-cta">Tap to open ↓</span>
      </div>
    </div>
  `;

  // Tap → expand in place + auto-mark as read
  card.addEventListener("click", async () => {
    const expanded = buildExpandedCard(docSnap, document.createElement("div"), {
      ...msg, isRead: true
    });
    card.replaceWith(expanded);
    try {
      await updateDoc(doc(db, "messages", docSnap.id), { isRead: true });
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  });

  return card;
}

// ─── Reported preview (auto-collapsed) ───────────────────────
function buildReportedPreview(docSnap, card, msg) {
  const date = msg.createdAt?.toDate
    ? formatDate(msg.createdAt.toDate())
    : "Just now";

  card.className = `message-card reported-collapsed ${bgClass(msg.bgKey)}${msg.isFavorite ? " favorite" : ""}`;
  card.dataset.id = docSnap.id;
  card.innerHTML = `
    <div class="message-flags">
      <span class="status-pill report-pill">Reported</span>
    </div>
    <div class="message-meta">
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
        <span class="message-sender">This reported letter is hidden.</span>
        <span class="message-date">${date}</span>
      </div>
      <div class="message-actions">
        <button class="btn-card-action btn-show-reported" data-id="${docSnap.id}">Show</button>
      </div>
    </div>
  `;

  card.querySelector(".btn-show-reported").addEventListener("click", () => {
    expandedReportedIds.add(docSnap.id);
    renderMessages();
  });

  return card;
}

// ─── Full expanded card ───────────────────────────────────────
function buildExpandedCard(docSnap, card, msg) {
  const date = msg.createdAt?.toDate
    ? formatDate(msg.createdAt.toDate())
    : "Just now";

  const senderHTML = msg.isAnonymous
    ? `<span class="anon-badge">🎭 Anonymous</span>`
    : `<span class="message-sender">From <strong>${escapeHtml(msg.senderName || "Someone")}</strong></span>`;

  card.className = `message-card ${bgClass(msg.bgKey)}${msg.isFavorite ? " favorite" : ""}`;
  card.dataset.id = docSnap.id;

  const reportedActions = msg.isReported ? `
        <button class="btn-card-action btn-report" data-id="${docSnap.id}">Unreport</button>
        <button class="btn-delete" data-id="${docSnap.id}" title="Delete this letter">Delete</button>
      ` : `
        <button class="btn-card-action btn-favorite" data-id="${docSnap.id}">${msg.isFavorite ? "Unpin" : "Pin"}</button>
        <button class="btn-card-action btn-reply" data-id="${docSnap.id}">Reply</button>
        <button class="btn-card-action btn-share" data-id="${docSnap.id}">Image</button>
        <button class="btn-card-action btn-report" data-id="${docSnap.id}">Report</button>
        <button class="btn-delete" data-id="${docSnap.id}" title="Delete this letter">Delete</button>
      `;

  card.innerHTML = `
    <div class="message-flags">
      ${msg.isFavorite ? `<span class="status-pill">Pinned</span>` : ""}
      ${msg.isReported ? `<span class="status-pill report-pill">Reported</span>` : ""}
    </div>
    <div class="message-text ${fontClass(msg.fontKey)}">${escapeHtml(msg.text)}</div>
    ${msg.replyText ? `<div class="reply-card"><span>${escapeHtml(msg.replierName || "You")} replied:</span><p>${escapeHtml(msg.replyText)}</p></div>` : ""}
    ${msg.isReported ? "" : `
    <div class="inline-reply-form hidden" data-reply-form="${docSnap.id}">
      <textarea maxlength="280" placeholder="Write your reply...">${escapeHtml(msg.replyText || "")}</textarea>
      <div class="inline-reply-actions">
        <button class="btn-card-action btn-cancel-reply" data-id="${docSnap.id}">Cancel</button>
        <button class="btn-card-action btn-save-reply" data-id="${docSnap.id}">Send reply</button>
      </div>
    </div>`}
    <div class="message-meta">
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
        ${senderHTML}
        <span class="message-date">${date}</span>
        ${msg.receiverReaction ? `<span class="reaction-status">${reactionMarks[msg.receiverReaction] || "✦"} ${reactionLabels[msg.receiverReaction] || "Reacted"}</span>` : ""}
      </div>
      <div class="message-actions">
${reportedActions}
      </div>
    </div>
    <div class="reaction-row ${msg.isReported ? "hidden" : ""}" aria-label="Reaction">
      ${reactionChoices.map(key => `
        <button class="reaction-btn ${msg.receiverReaction === key ? "active" : ""}" data-id="${docSnap.id}" data-reaction="${key}" title="${reactionLabels[key]}">
          ${reactionMarks[key]}
        </button>
      `).join("")}
    </div>
  `;

  card.querySelector(".btn-favorite")?.addEventListener("click", () => {
    updateDoc(doc(db, "messages", docSnap.id), { isFavorite: !Boolean(msg.isFavorite) });
  });

  card.querySelector(".btn-reply")?.addEventListener("click", () => {
    const form = card.querySelector(`[data-reply-form="${docSnap.id}"]`);
    form?.classList.toggle("hidden");
    form?.querySelector("textarea")?.focus();
  });

  card.querySelector(".btn-cancel-reply")?.addEventListener("click", () => {
    card.querySelector(`[data-reply-form="${docSnap.id}"]`)?.classList.add("hidden");
  });

  card.querySelector(".btn-save-reply")?.addEventListener("click", async () => {
    const reply = card.querySelector(`[data-reply-form="${docSnap.id}"] textarea`)?.value || "";
    const cleanReply = reply.trim();
    if (cleanReply.length > 280) return alert("Reply is too long. Keep it under 280 characters.");
    await updateDoc(doc(db, "messages", docSnap.id), {
      replyText: cleanReply,
      repliedAt: cleanReply ? serverTimestamp() : null
    });
  });

  card.querySelector(".btn-share")?.addEventListener("click", () => {
    shareMessageImage(msg);
  });

  card.querySelector(".btn-report").addEventListener("click", async () => {
    if (!msg.isReported && !confirm("Mark this letter as reported?")) return;
    if (msg.isReported) expandedReportedIds.delete(docSnap.id);
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

  card.querySelector(".btn-delete").addEventListener("click", async (e) => {
    const msgId = e.currentTarget.dataset.id;
    if (!confirm("Delete this letter? This can't be undone.")) return;
    try {
      await deleteDoc(doc(db, "messages", msgId));
      expandedReportedIds.delete(msgId);
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
  const display = profile.displayName || profile.username || "?";
  updateProfileAvatarPreview(color, display);
  if (profilePreviewNameEl) profilePreviewNameEl.textContent = profile.displayName || profile.username || "Your profile";
  if (profilePreviewBioEl) profilePreviewBioEl.textContent = profile.bio || "No bio added yet.";
}

function updateProfileAvatarPreview(color, displayName) {
  const display = displayName || profileNameEl?.value.trim() || currentProfile?.displayName || currentProfile?.username || "?";
  [profileAvatarEl, profileEditAvatarEl].forEach((avatarEl) => {
    if (!avatarEl) return;
    avatarEl.textContent = display.charAt(0).toUpperCase();
    avatarEl.style.background = color || "#2c1e0f";
  });
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
    showProfilePreview();
  } catch (err) {
    console.error("Profile save error:", err);
    setProfileStatus("Could not save profile. Try again.", true);
  }
}

function showProfileEdit() {
  hydrateProfileForm(currentProfile || {});
  profilePreviewEl?.classList.add("hidden");
  profileEditEl?.classList.remove("hidden");
  if (deleteAccountConfirmEl) deleteAccountConfirmEl.classList.add("hidden");
  if (deleteAccountInputEl) deleteAccountInputEl.value = "";
  setProfileStatus("", false);
  setDeleteAccountStatus("", false);
}

function showProfilePreview() {
  profileEditEl?.classList.add("hidden");
  profilePreviewEl?.classList.remove("hidden");
}

function cancelProfileEdit() {
  if (currentProfile) hydrateProfileForm(currentProfile);
  if (deleteAccountConfirmEl) deleteAccountConfirmEl.classList.add("hidden");
  if (deleteAccountInputEl) deleteAccountInputEl.value = "";
  setProfileStatus("", false);
  setDeleteAccountStatus("", false);
  showProfilePreview();
}

function setProfileStatus(message, isError) {
  if (!profileStatusEl) return;
  profileStatusEl.textContent = message;
  profileStatusEl.className = `field-status ${isError ? "err" : "ok"}`;
}

function showDeleteAccountConfirm() {
  deleteAccountConfirmEl?.classList.remove("hidden");
  deleteAccountInputEl?.focus();
  setDeleteAccountStatus("", true);
}

function cancelDeleteAccountConfirm() {
  if (deleteAccountConfirmEl) deleteAccountConfirmEl.classList.add("hidden");
  if (deleteAccountInputEl) deleteAccountInputEl.value = "";
  setDeleteAccountStatus("", false);
}

async function handleDeleteAccount() {
  if (!currentUser || !currentProfile) return;

  if ((deleteAccountInputEl?.value || "").trim().toLowerCase() !== "delete") {
    setDeleteAccountStatus("Please type delete exactly to confirm.", true);
    return;
  }

  btnDeleteAccount.disabled = true;
  btnDeleteAccount.textContent = "Deleting...";
  setDeleteAccountStatus("Deleting your letters and profile...", false);

  try {
    const lastSignIn = new Date(currentUser.metadata?.lastSignInTime || 0).getTime();
    if (!lastSignIn || Date.now() - lastSignIn > 10 * 60 * 1000) {
      throw { code: "auth/requires-recent-login" };
    }

    if (unsubscribeMessages) unsubscribeMessages();

    const messageSnap = await getDocs(query(
      collection(db, "messages"),
      where("toUserId", "==", currentUser.uid)
    ));

    const deleteRefs = messageSnap.docs.map(messageDoc => doc(db, "messages", messageDoc.id));
    if (currentProfile.username) deleteRefs.push(doc(db, "usernames", currentProfile.username));
    deleteRefs.push(doc(db, "users", currentUser.uid));

    for (let i = 0; i < deleteRefs.length; i += 450) {
      const batch = writeBatch(db);
      deleteRefs.slice(i, i + 450).forEach(ref => batch.delete(ref));
      await batch.commit();
    }

    await deleteUser(currentUser);
    window.location.href = "index.html";
  } catch (err) {
    console.error("Account delete error:", err);
    btnDeleteAccount.disabled = false;
    btnDeleteAccount.textContent = "Delete account";

    if (err.code === "auth/requires-recent-login") {
      setDeleteAccountStatus("Please sign out, sign in again, then delete your account.", true);
      return;
    }
    setDeleteAccountStatus("Could not delete account. Please try again.", true);
  }
}

function setDeleteAccountStatus(message, isError) {
  if (!deleteAccountStatusEl) return;
  deleteAccountStatusEl.textContent = message;
  deleteAccountStatusEl.className = `field-status ${isError ? "err" : "ok"}`;
}

async function shareMessageImage(msg) {
  const canvas = document.createElement("canvas");
  const width  = 1080;
  const height = 1350;
  const ctx    = canvas.getContext("2d");

  // Retina scaling — capped at 2x to avoid mobile memory crash
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = width * scale;
  canvas.height = height * scale;
  canvas.style.width  = width + "px";
  canvas.style.height = height + "px";
  ctx.scale(scale, scale);

  // Force load every font variant before drawing
  await Promise.all([
    document.fonts.load("400 54px Caveat"),
    document.fonts.load("400 48px 'Patrick Hand'"),
    document.fonts.load("400 50px Kalam"),
    document.fonts.load("700 50px Kalam"),
    document.fonts.load("400 44px Lora"),
    document.fonts.load("italic 400 44px Lora")
  ]);
  await document.fonts.ready;

  // Extra delay for mobile rendering
  await new Promise(r => setTimeout(r, 150));

  // Background
  drawShareBackground(ctx, width, height, msg.bgKey);

  // Font map — all 4 letter styles
  const fontMap = {
    "hand-caveat":  "54px Caveat, cursive",
    "hand-patrick": "48px 'Patrick Hand', cursive",
    "hand-kalam":   "50px Kalam, cursive",
    "normal":       "44px Lora, Georgia, serif"
  };
  const bodyFont  = fontMap[msg.fontKey] || "54px Caveat, cursive";
  const labelFont = "34px Kalam, cursive";
  const replyFont = "38px Kalam, cursive";
  const brandFont = "32px Kalam, cursive";

  // Main letter text
  ctx.fillStyle = "#2c1e0f";
  ctx.font = bodyFont;
  wrapCanvasText(ctx, msg.text || "", 90, 190, width - 180, 72, 760);

  // Sender label
  ctx.font = labelFont;
  ctx.fillStyle = "rgba(44,30,15,0.68)";
  ctx.fillText(
    msg.isAnonymous ? "Anonymous letter" : `From ${msg.senderName || "Someone"}`,
    90, 1040
  );

  // Reply block
  if (msg.replyText) {
    ctx.fillStyle = "rgba(44,30,15,0.9)";
    ctx.font = replyFont;
    ctx.fillText("Reply", 90, 1130);
    ctx.font = labelFont;
    wrapCanvasText(ctx, msg.replyText, 90, 1190, width - 180, 48, 120);
  }

  // Branding
  ctx.font = brandFont;
  ctx.fillStyle = "rgba(44,30,15,0.5)";
  ctx.fillText("Chithi", 90, 1270);

  // ── Download ─────────────────────────────────────────────
  const dataUrl = canvas.toDataURL("image/png");

  const isIOS    = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  if (isIOS || isSafari) {
    // iOS Safari can't trigger download — open in new tab, user long-presses to save
    window.open(dataUrl, "_blank");
  } else {
    // Android, Chrome, Firefox, Desktop — direct download
    const link = document.createElement("a");
    link.download = "chithi-letter.png";
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
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
