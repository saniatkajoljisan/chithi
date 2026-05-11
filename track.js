// ============================================================
//  track.js  —  Letter tracking page
//
//  - Loads saved letters from localStorage (saved by sendMessage.js)
//  - Accepts a short tracking code (first 4 chars of token) OR
//    the full 32-char token to look up the message in Firestore
//  - Renders the same messenger-style thread as delete.html
//  - Allows unsending (deleting) the letter
// ============================================================

import { db } from "./firebase-config.js";
import {
  deleteDoc,
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── localStorage key ────────────────────────────────────────
const LS_KEY = "chithi_sent_letters";

// ─── DOM refs ────────────────────────────────────────────────
const trackInputCard  = document.getElementById("track-input-card");
const trackLoadingEl  = document.getElementById("track-loading");
const trackResultEl   = document.getElementById("track-result");
const trackUnsentEl   = document.getElementById("track-unsent");
const trackNotFoundEl = document.getElementById("track-not-found");

const trackCodeInput  = document.getElementById("track-code-input");
const btnTrack        = document.getElementById("btn-track");
const trackBtnText    = document.getElementById("track-btn-text");
const trackSpinner    = document.getElementById("track-spinner");
const trackError      = document.getElementById("track-error");

const savedLettersList= document.getElementById("saved-letters-list");

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
const btnUnsend       = document.getElementById("btn-unsend");
const unsendSpinner   = document.getElementById("unsend-spinner");
const unsendBtnText   = document.getElementById("unsend-btn-text");
const unsendError     = document.getElementById("unsend-error");
const btnKeep         = document.getElementById("btn-keep");
const btnBack         = document.getElementById("btn-back-to-input");
const btnAfterUnsend  = document.getElementById("btn-after-unsend");
const btnNotFoundBack = document.getElementById("btn-not-found-back");

// ─── Allowed keys ────────────────────────────────────────────
const ALLOWED_FONTS = new Set(["hand-caveat", "hand-patrick", "hand-kalam", "normal"]);
const ALLOWED_BGS   = new Set(["paper", "rose", "mint", "sky"]);
const REACTION_EMOJI = { heart: "❤️", smile: "🤣", cry: "😭", spark: "🤬" };

// Sender reactions for reply (messenger style)
const SENDER_REACTIONS = [
  { key: "heart", emoji: "❤️" },
  { key: "smile", emoji: "😊" },
  { key: "sad",   emoji: "😢" },
  { key: "angry", emoji: "😡" },
];

// Current full token being viewed
let currentToken = null;
// Current message data
let currentMsg = null;

// ─── localStorage helpers ────────────────────────────────────

/** Read all saved letters from localStorage */
function getSavedLetters() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch (_) {
    return [];
  }
}

/** Remove a letter from localStorage by token */
function removeSavedLetter(token) {
  try {
    const letters = getSavedLetters().filter(l => l.token !== token);
    localStorage.setItem(LS_KEY, JSON.stringify(letters));
  } catch (_) {}
}

// ─── Render saved letters list ───────────────────────────────
function renderSavedLetters() {
  const letters = getSavedLetters();
  if (!letters.length) {
    savedLettersList.innerHTML = `<p class="no-saved-msg">No letters saved on this device yet.</p>`;
    return;
  }

  savedLettersList.innerHTML = "";
  // Most recent first
  [...letters].reverse().forEach(letter => {
    const item = document.createElement("div");
    item.className = "saved-letter-item";
    item.innerHTML = `
      <div class="saved-letter-preview">
        <span class="saved-letter-to">To: <strong>${escapeHtml(letter.toUsername || "someone")}</strong></span>
        <span class="saved-letter-sep"> · </span>
        <span class="saved-letter-text">${escapeHtml((letter.preview || "").slice(0, 40))}${(letter.preview?.length || 0) > 40 ? "…" : ""}</span>
      </div>
      <span class="saved-letter-code">${escapeHtml(letter.shortCode || "")}</span>
    `;
    item.addEventListener("click", () => {
      trackCodeInput.value = letter.shortCode || "";
      lookupByShortCode(letter.shortCode, letter.token);
    });
    savedLettersList.appendChild(item);
  });
}

// ─── Track button ────────────────────────────────────────────
btnTrack?.addEventListener("click", () => {
  const raw = (trackCodeInput.value || "").trim().toUpperCase();
  if (!raw) return showTrackError("Please enter a tracking code.");
  hideTrackError();

  // Full 32-char token entered directly
  if (/^[a-f0-9]{32}$/i.test(raw)) {
    loadByToken(raw.toLowerCase());
    return;
  }

  // Short code: try to match against saved letters first
  const letters = getSavedLetters();
  const match = letters.find(l => l.shortCode === raw);
  if (match) {
    lookupByShortCode(raw, match.token);
  } else {
    // Short code not in localStorage — can't resolve without the full token
    showTrackError("Code not found on this device. If you sent the letter from a different device, use the full tracking link instead.");
  }
});

// Allow Enter key
trackCodeInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnTrack.click();
});

// ─── Lookup helpers ──────────────────────────────────────────

function lookupByShortCode(shortCode, fullToken) {
  if (!fullToken || !/^[a-f0-9]{32}$/i.test(fullToken)) {
    showTrackError("Could not resolve this code. Please use the full tracking link.");
    return;
  }
  loadByToken(fullToken.toLowerCase());
}

async function loadByToken(token) {
  currentToken = token;
  showPanel("loading");

  try {
    const msgSnap = await getDoc(doc(db, "messages", token));
    if (!msgSnap.exists()) {
      // Letter was deleted (by recipient or already unsent) — clean localStorage
      removeSavedLetter(token);
      renderSavedLetters(); // refresh the saved list so it disappears
      showPanel("not-found");
      return;
    }

    const msg = msgSnap.data();
    currentMsg = msg;

    // Fetch recipient profile
    let recipientName    = "Recipient";
    let recipientColor   = "#2c1e0f";
    let recipientInitial = "R";
    try {
      const userSnap = await getDoc(doc(db, "users", msg.toUserId));
      if (userSnap.exists()) {
        const u = userSnap.data();
        recipientName    = u.displayName || u.username || "Recipient";
        recipientColor   = u.avatarColor  || "#2c1e0f";
        recipientInitial = recipientName.charAt(0).toUpperCase();
      }
    } catch (_) {}

    renderBubble(msg);
    renderReaction(msg);
    renderReceipt(msg, recipientInitial, recipientColor);
    renderReply(msg, recipientName, recipientInitial, recipientColor);
    
    // Hide unsend if letter was read, reacted or replied
    const isEngaged = msg.isRead || msg.receiverReaction || msg.replyText;
    const unsendDivider = document.querySelector("#track-result .thread-divider");
    const unsendPara    = document.querySelector("#track-result .auth-sub:last-of-type");
    if (isEngaged) {
      btnUnsend?.classList.add("hidden");
      unsendDivider?.classList.add("hidden");
      unsendPara?.classList.add("hidden");
    } else {
      btnUnsend?.classList.remove("hidden");
      unsendDivider?.classList.remove("hidden");
      unsendPara?.classList.remove("hidden");
    }
    
    showPanel("result");

  } catch (err) {
    console.error("Error loading letter:", err);
    showPanel("not-found");
  }
}

// ─── Render: sent letter bubble ──────────────────────────────
function renderBubble(msg) {
  const fontKey = ALLOWED_FONTS.has(msg.fontKey) ? msg.fontKey : "hand-caveat";
  const bgKey   = ALLOWED_BGS.has(msg.bgKey)     ? msg.bgKey   : "paper";

  msgBubbleEl.classList.remove("letter-bg-paper","letter-bg-rose","letter-bg-mint","letter-bg-sky");
  msgBubbleEl.classList.add(`letter-bg-${bgKey}`);

  msgBubbleTextEl.classList.remove("font-hand-caveat","font-hand-patrick","font-hand-kalam","font-normal");
  msgBubbleTextEl.classList.add(`font-${fontKey}`);

  const preview = (msg.text || "").length > 320 ? msg.text.slice(0, 320) + "…" : msg.text;
  msgBubbleTextEl.textContent = preview;

  // Sent time
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
function renderReceipt(msg, recipientInitial, recipientColor) {
  receiptRowEl.innerHTML = "";

  if (msg.receiverReaction || msg.replyText) {
    receiptRowEl.classList.add("hidden");
    return;
  }
  receiptRowEl.classList.remove("hidden");

  if (msg.isRead) {
    const label  = document.createElement("span");
    label.className = "receipt-label";
    label.textContent = "Seen";

    const avatar = document.createElement("div");
    avatar.className   = "receipt-avatar";
    avatar.textContent = recipientInitial;
    avatar.style.background = recipientColor;
    avatar.title = "Seen by recipient";

    receiptRowEl.appendChild(label);
    receiptRowEl.appendChild(avatar);
  } else {
    const label  = document.createElement("span");
    label.className = "receipt-label";
    label.textContent = "Delivered";

    const ticks = document.createElement("span");
    ticks.className = "receipt-ticks";
    ticks.innerHTML = `<svg width="20" height="12" viewBox="0 0 20 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 6L5 10L11 2" stroke="#8c7a6b" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7 6L11 10L17 2" stroke="#8c7a6b" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

    receiptRowEl.appendChild(label);
    receiptRowEl.appendChild(ticks);
  }
}

// ─── Render: reply bubble ───────────────────────────────────
function renderReply(msg, recipientName, recipientInitial, recipientColor) {
  if (!msg.replyText) {
    replyRowEl.classList.add("hidden");
    return;
  }

  replyAvatarEl.textContent      = recipientInitial;
  replyAvatarEl.style.background = recipientColor;
  replyAvatarEl.title            = recipientName;
  replyBubNameEl.textContent     = msg.replierName || recipientName;
  replyBubTextEl.textContent     = msg.replyText;

  // Reply time
  replyRowEl.querySelector(".reply-time")?.remove();
  const replyTimeEl = document.createElement("div");
  replyTimeEl.className = "msg-time reply-time";
  replyTimeEl.textContent = formatTime(msg.repliedAt || msg.createdAt);
  document.querySelector(".reply-bubble").appendChild(replyTimeEl);

  replyRowEl.classList.remove("hidden");

  // Messenger-style reaction button inside bubble wrap
  renderSenderReaction(msg);
}

// ─── Render: messenger-style sender reaction on reply ──────────
function renderSenderReaction(msg) {
  // Remove old button if any
  document.getElementById("reply-react-btn-wrap")?.remove();

  if (!msg.replyText) return;

  // Find the bubble wrap (parent of .reply-bubble)
  const bubbleWrap = document.querySelector(".reply-bubble-wrap");
  if (!bubbleWrap) return;

  const chosen = msg.senderReactionToReply || null;

  const wrap = document.createElement("div");
  wrap.id = "reply-react-btn-wrap";
  wrap.className = "reply-react-btn-wrap";
  wrap.innerHTML = buildReactBtnHtml(chosen, false);
  bubbleWrap.appendChild(wrap);

  attachReactEvents(wrap, chosen, msg);
}

function buildReactBtnHtml(chosen, popupOpen) {
  const popupHtml = `
    <div class="reply-reaction-popup${popupOpen ? "" : " hidden"}" id="reply-reaction-popup">
      ${SENDER_REACTIONS.map(r =>
        `<button class="reply-r-opt${chosen === r.key ? " active" : ""}" data-key="${r.key}">${r.emoji}</button>`
      ).join("")}
    </div>`;

  if (chosen) {
    const emoji = SENDER_REACTIONS.find(r => r.key === chosen)?.emoji || "";
    return `${popupHtml}<button class="reply-react-chosen" id="reply-react-trigger">${emoji}</button>`;
  }
  return `${popupHtml}<button class="reply-react-trigger" id="reply-react-trigger" title="React">&#x263A;</button>`;
}

function attachReactEvents(wrap, chosen, msg) {
  let popupOpen = false;

  const trigger = wrap.querySelector("#reply-react-trigger");
  trigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    popupOpen = !popupOpen;
    wrap.innerHTML = buildReactBtnHtml(chosen, popupOpen);
    attachReactEvents(wrap, chosen, msg);
    if (popupOpen) {
      setTimeout(() => document.addEventListener("click", outsideClose), 10);
    }
  });

  wrap.querySelectorAll(".reply-r-opt").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const key = btn.dataset.key;
      chosen = key;
      popupOpen = false;
      document.removeEventListener("click", outsideClose);
      wrap.innerHTML = buildReactBtnHtml(chosen, false);
      attachReactEvents(wrap, chosen, msg);
      await saveSenderReaction(key, wrap, msg);
    });
  });

  function outsideClose() {
    popupOpen = false;
    document.removeEventListener("click", outsideClose);
    wrap.innerHTML = buildReactBtnHtml(chosen, false);
    attachReactEvents(wrap, chosen, msg);
  }
}

async function saveSenderReaction(key, wrap, msg) {
  if (!currentToken) return;
  try {
    await updateDoc(doc(db, "messages", currentToken), { senderReactionToReply: key });
    if (currentMsg) currentMsg.senderReactionToReply = key;
  } catch (err) {
    console.error("Failed to save reaction:", err);
  }
}


btnUnsend?.addEventListener("click", async () => {
  if (!currentToken) return;
  unsendError?.classList.add("hidden");
  setUnsendLoading(true);

  try {
    await deleteDoc(doc(db, "messages", currentToken));
    removeSavedLetter(currentToken);
    showPanel("unsent");
  } catch (err) {
    console.error("Unsend error:", err);
    if (unsendError) {
      unsendError.textContent = "Failed to unsend. Please try again.";
      unsendError.classList.remove("hidden");
    }
    setUnsendLoading(false);
  }
});

// ─── Navigation ──────────────────────────────────────────────
btnKeep?.addEventListener("click", () => {
  currentToken = null;
  showPanel("input");
});

btnBack?.addEventListener("click", () => {
  currentToken = null;
  showPanel("input");
});

btnAfterUnsend?.addEventListener("click", () => {
  currentToken = null;
  renderSavedLetters();
  showPanel("input");
});

btnNotFoundBack?.addEventListener("click", () => {
  currentToken = null;
  showPanel("input");
});

// ─── Panel switcher ──────────────────────────────────────────
function showPanel(name) {
  [trackInputCard, trackLoadingEl, trackResultEl, trackUnsentEl, trackNotFoundEl]
    .forEach(el => el?.classList.add("hidden"));

  const map = {
    input:     trackInputCard,
    loading:   trackLoadingEl,
    result:    trackResultEl,
    unsent:    trackUnsentEl,
    "not-found": trackNotFoundEl
  };
  map[name]?.classList.remove("hidden");
}

// ─── Tiny helpers ────────────────────────────────────────────
function setUnsendLoading(on) {
  if (btnUnsend)    btnUnsend.disabled = on;
  unsendSpinner?.classList.toggle("hidden", !on);
  unsendBtnText?.classList.toggle("hidden", on);
}
function showTrackError(msg) {
  if (!trackError) return;
  trackError.textContent = msg;
  trackError.classList.remove("hidden");
}
function hideTrackError() {
  trackError?.classList.add("hidden");
}
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
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

// ─── Boot ────────────────────────────────────────────────────
renderSavedLetters();
showPanel("input");
