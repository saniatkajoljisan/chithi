// ============================================================
//  delete.js  —  Messenger-style letter status + unsend
//
//  Reads the message doc by token (= doc ID), then renders:
//    • Sent letter bubble (with font + bg from message data)
//    • Reaction floating below the bubble (if any)
//    • Seen (with recipient avatar) OR Delivered ticks receipt
//    • Reply bubble on the left (if recipient replied)
//
//  Confirm button permanently deletes the message.
// ============================================================

import { db } from "./firebase-config.js";
import {
  deleteDoc,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { applyAvatar } from "./avatar-helper.js";

// ─── DOM refs ────────────────────────────────────────────────
const loadingEl       = document.getElementById("delete-loading");
const confirmEl       = document.getElementById("delete-confirm");
const successEl       = document.getElementById("delete-success");
const notFoundEl      = document.getElementById("delete-not-found");

// Thread elements
const msgBubbleEl     = document.getElementById("msg-bubble");
const msgBubbleTextEl = document.getElementById("msg-bubble-text");
const reactionFloatEl = document.getElementById("msg-reaction-float");
const reactionEmojiEl = document.getElementById("reaction-emoji");
const receiptRowEl    = document.getElementById("msg-receipt-row");
const replyRowEl      = document.getElementById("msg-reply-row");
const replyAvatarEl   = document.getElementById("reply-avatar");
const replyBubNameEl  = document.getElementById("reply-bubble-name");
const replyBubTextEl  = document.getElementById("reply-bubble-text");

// Action elements
const btnConfirm      = document.getElementById("btn-confirm-delete");
const deleteSpinner   = document.getElementById("delete-spinner");
const deleteBtnText   = document.getElementById("delete-btn-text");
const deleteErrorEl   = document.getElementById("delete-error");

// ─── Allowed keys (mirror sendMessage.js) ────────────────────
const ALLOWED_FONTS = new Set(["hand-caveat", "hand-patrick", "hand-kalam", "normal"]);
const ALLOWED_BGS   = new Set(["paper", "rose", "mint", "sky"]);

const REACTION_EMOJI = { heart: "❤️", smile: "🤣", cry: "😭", spark: "🤬" };

// ─── Read token ──────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const token  = params.get("token") || getTokenFromPath();

function getTokenFromPath() {
  const parts     = window.location.pathname.split("/").filter(Boolean);
  const markerIdx = parts.lastIndexOf("d");
  const candidate = markerIdx === -1 ? "" : (parts[markerIdx + 1] || "");
  return /^[a-f0-9]{32}$/i.test(candidate) ? candidate.toLowerCase() : "";
}

// ─── Init ────────────────────────────────────────────────────
async function init() {
  if (!token) { showPanel("not-found"); return; }

  try {
    // Token IS the document ID — no query needed, no rules problem
    const msgSnap = await getDoc(doc(db, "messages", token));
    if (!msgSnap.exists()) { showPanel("not-found"); return; }

    const msg = msgSnap.data();

    // Fetch recipient profile for avatar + name
    let recipientName  = "Recipient";
    let recipientColor = "#2c1e0f";
    let recipientInitial = "R";
    let recipientPhoto = null;
    try {
      const userSnap = await getDoc(doc(db, "users", msg.toUserId));
      if (userSnap.exists()) {
        const u = userSnap.data();
        recipientName    = u.displayName || u.username || "Recipient";
        recipientColor   = u.avatarColor  || "#2c1e0f";
        recipientInitial = recipientName.charAt(0).toUpperCase();
        recipientPhoto   = u.photoData || null;
      }
    } catch (_) { /* non-fatal */ }

    // ── Render the thread ──────────────────────────────────
    renderBubble(msg);
    renderReaction(msg);
    renderReceipt(msg, recipientInitial, recipientColor, recipientPhoto);
    renderReply(msg, recipientName, recipientInitial, recipientColor, recipientPhoto);
    
    // Hide unsend if letter was read, reacted or replied
    const isEngaged = msg.isRead || msg.receiverReaction || msg.replyText;
    const btnConfirmDel = document.getElementById("btn-confirm-delete");
    const unsendDivider = document.querySelector("#delete-confirm .thread-divider");
    const unsendPara    = document.querySelector("#delete-confirm .auth-sub:last-of-type");
    if (isEngaged) {
      btnConfirmDel?.classList.add("hidden");
      unsendDivider?.classList.add("hidden");
      unsendPara?.classList.add("hidden");
    } else {
      btnConfirmDel?.classList.remove("hidden");
      unsendDivider?.classList.remove("hidden");
      unsendPara?.classList.remove("hidden");
    }
    
    showPanel("confirm");

  } catch (err) {
    console.error("Error loading letter:", err);
    showPanel("not-found");
  }
}

// ─── Render: sent letter bubble ──────────────────────────────
function renderBubble(msg) {
  const fontKey = ALLOWED_FONTS.has(msg.fontKey) ? msg.fontKey : "hand-caveat";
  const bgKey   = ALLOWED_BGS.has(msg.bgKey)     ? msg.bgKey   : "paper";

  // Background class on the bubble
  msgBubbleEl.classList.remove(
    "letter-bg-paper", "letter-bg-rose", "letter-bg-mint", "letter-bg-sky"
  );
  msgBubbleEl.classList.add(`letter-bg-${bgKey}`);

  // Font class on the text span
  msgBubbleTextEl.classList.remove(
    "font-hand-caveat", "font-hand-patrick", "font-hand-kalam", "font-normal"
  );
  msgBubbleTextEl.classList.add(`font-${fontKey}`);

  // Text — truncate long letters at 320 chars for the preview
  const preview = (msg.text || "").length > 320
    ? msg.text.slice(0, 320) + "…"
    : msg.text;
  msgBubbleTextEl.textContent = preview;
  msgBubbleEl.querySelector(".msg-bubble-time")?.remove();

  const sentTimeEl = document.createElement("div");
  sentTimeEl.className = "msg-time msg-bubble-time";
  sentTimeEl.textContent = formatTime(msg.createdAt);
  msgBubbleEl.appendChild(sentTimeEl);
}

// ─── Render: reaction float ──────────────────────────────────
function renderReaction(msg) {
  const rKey = msg.receiverReaction;
  if (!rKey || !REACTION_EMOJI[rKey]) {
    reactionFloatEl.classList.add("hidden");
    return;
  }
  reactionEmojiEl.textContent = REACTION_EMOJI[rKey];
  reactionFloatEl.classList.remove("hidden");
}

// ─── Render: seen / delivered receipt ────────────────────────
function renderReceipt(msg, recipientInitial, recipientColor, recipientPhoto) {
  receiptRowEl.innerHTML = "";

   // 🚨 NEW CONDITION: hide receipt if reacted OR replied
  if (msg.receiverReaction || msg.replyText) {
    receiptRowEl.classList.add("hidden");
    return;
  } else {
    receiptRowEl.classList.remove("hidden");
  }

  if (msg.isRead) {
    // ── SEEN: avatar circle + "Seen" label ──────────────────
    const label  = document.createElement("span");
    label.className = "receipt-label";
    label.textContent = "Seen";

    const avatar = document.createElement("div");
    avatar.className    = "receipt-avatar";
    applyAvatar(avatar, { photoData: recipientPhoto, color: recipientColor, name: recipientInitial });
    avatar.title        = "Seen by recipient";

    receiptRowEl.appendChild(label);
    receiptRowEl.appendChild(avatar);

  } else {
    // ── DELIVERED: double-tick ───────────────────────────────
    const label  = document.createElement("span");
    label.className = "receipt-label";
    label.textContent = "Delivered";

    const ticks = document.createElement("span");
    ticks.className = "receipt-ticks";
    // Two overlapping check marks — classic messenger double-tick
    ticks.innerHTML = `<svg width="20" height="12" viewBox="0 0 20 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- first tick -->
      <path d="M1 6L5 10L11 2" stroke="#8c7a6b" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- second tick (offset right) -->
      <path d="M7 6L11 10L17 2" stroke="#8c7a6b" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

    receiptRowEl.appendChild(label);
    receiptRowEl.appendChild(ticks);
  }
}

// ─── Render: reply bubble ────────────────────────────────────
function renderReply(msg, recipientName, recipientInitial, recipientColor, recipientPhoto) {
  if (!msg.replyText) {
    replyRowEl.classList.add("hidden");
    return;
  }

  // Avatar
  applyAvatar(replyAvatarEl, { photoData: recipientPhoto, color: recipientColor, name: recipientInitial });
  replyAvatarEl.title             = recipientName;

  // Name label
  replyBubNameEl.textContent = msg.replierName || recipientName;

  // Reply text
  replyBubTextEl.textContent = msg.replyText;
  replyRowEl.classList.remove("hidden");
  replyRowEl.querySelector(".reply-time")?.remove();

const replyTimeEl = document.createElement("div");
replyTimeEl.className = "msg-time reply-time";
replyTimeEl.textContent = formatTime(msg.repliedAt || msg.createdAt);

document.querySelector(".reply-bubble").appendChild(replyTimeEl);
}

// ─── Confirm delete ──────────────────────────────────────────
btnConfirm?.addEventListener("click", async () => {
  if (!token) return;
  hideError();
  setLoading(true);

  try {
    await deleteDoc(doc(db, "messages", token));
    showPanel("success");
  } catch (err) {
    console.error("Delete error:", err);
    showError("Failed to unsend the letter. Please try again.");
    setLoading(false);
  }
});

// ─── Panel switcher ──────────────────────────────────────────
function showPanel(name) {
  [loadingEl, confirmEl, successEl, notFoundEl].forEach(el => el?.classList.add("hidden"));
  const map = {
    loading:     loadingEl,
    confirm:     confirmEl,
    success:     successEl,
    "not-found": notFoundEl
  };
  map[name]?.classList.remove("hidden");
}

// Time show on reply
function formatTime(timestamp) {
  if (!timestamp) return "";
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const day   = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year  = String(d.getFullYear()).slice(-2);
  const hours = d.getHours();
  const mins  = String(d.getMinutes()).padStart(2, "0");
  const ampm  = hours >= 12 ? "PM" : "AM";
  const h12   = String(hours % 12 || 12).padStart(2, "0");

  return `${day}/${month}/${year} ${h12}:${mins} ${ampm}`;
}

// ─── Tiny helpers ────────────────────────────────────────────
function showError(msg) {
  if (!deleteErrorEl) return;
  deleteErrorEl.textContent = msg;
  deleteErrorEl.classList.remove("hidden");
}
function hideError() { deleteErrorEl?.classList.add("hidden"); }
function setLoading(on) {
  if (btnConfirm)    btnConfirm.disabled = on;
  deleteSpinner?.classList.toggle("hidden", !on);
  deleteBtnText?.classList.toggle("hidden", on);
}

// ─── Boot ────────────────────────────────────────────────────
init();
