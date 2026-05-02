// ============================================================
//  js/sendMessage.js
//  Handles the public /user.html page — send anonymous messages
// ============================================================

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  query,
  where,
  getDocs,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Read username from URL ──────────────────────────────────
// URL formats: /username, /user?u=username, /user.html?u=username
const params = new URLSearchParams(window.location.search);
const routeUsername = getUsernameFromPath();
const username = (params.get("u") || routeUsername || "").toLowerCase();

function getUsernameFromPath() {
  const reservedRoutes = new Set(["index", "login", "signup", "dashboard", "user", "delete"]);
  const parts = window.location.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";

  if (reservedRoutes.has(last) || last.includes(".")) return "";
  return /^[a-z0-9_]{3,20}$/i.test(last) ? decodeURIComponent(last) : "";
}

// ─── DOM references ──────────────────────────────────────────
const loadingEl      = document.getElementById("user-loading");
const notFoundEl     = document.getElementById("user-not-found");
const formWrapEl     = document.getElementById("user-form-wrap");
const usernameDisplay= document.getElementById("username-display");
const avatarCircle   = document.getElementById("avatar-circle");
const userTaglineEl  = document.querySelector(".user-tagline");
const messageTextEl  = document.getElementById("message-text");
const letterFormCard = document.querySelector(".letter-form-card");
const styleChoiceEls = document.querySelectorAll('input[name="letter-style"]');
const anonToggle     = document.getElementById("anon-toggle");
const senderNameGroup= document.getElementById("sender-name-group");
const senderNameEl   = document.getElementById("sender-name");
const btnSend        = document.getElementById("btn-send");
const sendSpinner    = document.getElementById("send-spinner");
const sendBtnText    = document.getElementById("send-btn-text");
const sendError      = document.getElementById("send-error");
const charCountEl    = document.getElementById("char-count");
const successEl      = document.getElementById("send-success");
const formContainerEl= document.getElementById("message-form-container");
const deleteLinkEl   = document.getElementById("delete-link-display");
const btnCopyDelete  = document.getElementById("btn-copy-delete");
const btnSendAnother = document.getElementById("btn-send-another");

// ─── State ──────────────────────────────────────────────────
let targetUserId = null;
const allowedFontKeys = new Set([
  "hand-caveat", "hand-patrick", "hand-kalam", "normal"
]);
const allowedBgKeys = new Set([
  "paper", "rose", "mint", "sky"
]);
const styleToKeys = {
  "en-1": { font: "hand-caveat", bg: "paper" },
  "en-2": { font: "hand-patrick", bg: "rose" },
  "en-3": { font: "hand-kalam", bg: "mint" },
  "en-4": { font: "normal", bg: "sky" }
};
const blockedWords = [
  "fuck", "shit", "bitch", "asshole", "bastard", "slut", "whore",
  "madarchod", "bhosdike", "chod", "bal", "khanki"
];

// ─── Init ───────────────────────────────────────────────────
async function init() {
  if (!username) {
    showNotFound();
    return;
  }

  try {
    // Look up the user by username
    const q = query(collection(db, "users"), where("username", "==", username.toLowerCase()));
    const snap = await getDocs(q);

    if (snap.empty) {
      showNotFound();
      return;
    }

    const userData = snap.docs[0].data();
    targetUserId = userData.uid;

    // Update UI
    const displayName = userData.displayName || userData.username;
    usernameDisplay.textContent = displayName;
    avatarCircle.textContent    = displayName.charAt(0).toUpperCase();
    avatarCircle.style.background = userData.avatarColor || "#2c1e0f";
    if (userTaglineEl) {
      userTaglineEl.textContent = userData.bio || "They won't know who you are unless you tell them.";
    }
    document.title              = `Send a letter to ${displayName} — Chithi`;

    // Show the form
    loadingEl.classList.add("hidden");
    formWrapEl.classList.remove("hidden");

  } catch (err) {
    console.error("Error loading user:", err);
    showNotFound();
  }
}

function showNotFound() {
  loadingEl.classList.add("hidden");
  document.getElementById("user-not-found").classList.remove("hidden");
}

// ─── Character counter ───────────────────────────────────────
messageTextEl?.addEventListener("input", () => {
  charCountEl.textContent = messageTextEl.value.length;
});

styleChoiceEls.forEach((option) => {
  option.addEventListener("change", () => {
    applyStyle(getSelectedStyleKey());
  });
});

// ─── Anonymous toggle ────────────────────────────────────────
anonToggle?.addEventListener("change", () => {
  senderNameGroup.style.display = anonToggle.checked ? "none" : "block";
});

// ─── Send message ────────────────────────────────────────────
btnSend?.addEventListener("click", async () => {
  hideError();

  const text       = messageTextEl.value.trim();
  const isAnonymous= anonToggle.checked;
  const senderName = senderNameEl.value.trim();
  const fontKey    = getSelectedFontKey();
  const bgKey      = getSelectedBgKey();

  // Validate
  if (!text) return showError("Please write something before sending.");
  if (text.length > 2500) return showError("Message is too long (max 2500 characters).");
  if (containsBlockedWord(text) || containsBlockedWord(senderName)) {
    return showError("Please keep the letter respectful before sending.");
  }
  if (!isAnonymous && !senderName) return showError("Please enter your name, or switch to anonymous.");
  if (!targetUserId) return showError("Something went wrong. Please reload the page.");

  setLoading(true);

  const deleteToken = generateToken();

  try {
    // Store the message under its delete token so the sender can unsend
    // it later without needing a collection query that rules can't verify.
    await setDoc(doc(db, "messages", deleteToken), {
      toUserId:    targetUserId,
      text:        text,
      senderName:  isAnonymous ? "" : senderName,
      isAnonymous: isAnonymous,
      fontKey:     fontKey,
      bgKey:       bgKey,
      isRead:      false,
      isFavorite:  false,
      isReported:  false,
      deleteToken: deleteToken,
      createdAt:   serverTimestamp()
    });
  } catch (err) {
    console.error("Send error:", err);
    showError("Failed to send message. Please try again.");
    setLoading(false);
    return;
  }

  setLoading(false);
  showSendSuccess(deleteToken);
});

function showSendSuccess(deleteToken) {
  try {
    const deleteUrl = buildDeleteUrl(deleteToken);

    if (deleteLinkEl) deleteLinkEl.textContent = deleteUrl;
    formContainerEl?.classList.add("hidden");
    successEl?.classList.remove("hidden");

    if (btnCopyDelete) {
      btnCopyDelete.onclick = () => copyToClipboard(deleteUrl, btnCopyDelete);
    }
  } catch (err) {
    // The message has already been saved at this point. Do not show a send
    // failure for a post-send UI problem.
    console.error("Post-send UI error:", err);
    formContainerEl?.classList.add("hidden");
    successEl?.classList.remove("hidden");
  }
}

function buildDeleteUrl(deleteToken) {
  if (window.ChithiUrl?.delete) {
    return window.ChithiUrl.delete(deleteToken);
  }

  const basePath = window.location.pathname.replace(/\/[^/]*$/, "/");
  const origin = window.location.origin === "null" ? "" : window.location.origin;
  return `${origin}${basePath}delete.html?token=${encodeURIComponent(deleteToken)}`;
}

// ─── Send another ────────────────────────────────────────────
btnSendAnother?.addEventListener("click", () => {
  // Reset form safely
  if (messageTextEl) messageTextEl.value = "";
  if (senderNameEl) senderNameEl.value = "";

  const defaultLanguageOption = document.querySelector('input[name="letter-language"][value="en"]');
  if (defaultLanguageOption) defaultLanguageOption.checked = true;

  const defaultStyleOption = document.querySelector('input[name="letter-style"][value="en-1"]');
  if (defaultStyleOption) defaultStyleOption.checked = true;

  if (typeof applyLanguage === "function") {
    applyLanguage(getSelectedLanguage());
  }

  if (anonToggle) anonToggle.checked = true;
  if (senderNameGroup) senderNameGroup.style.display = "none";
  if (charCountEl) charCountEl.textContent = "0";

  if (successEl) successEl.classList.add("hidden");
  if (formContainerEl) formContainerEl.classList.remove("hidden");
});

// ─── Helpers ─────────────────────────────────────────────────

/** Generate a cryptographically random token */
function generateToken() {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
}

function showError(msg) {
  if (!sendError) return;
  sendError.textContent = msg;
  sendError.classList.remove("hidden");
}
function hideError() {
  sendError?.classList.add("hidden");
}
function setLoading(loading) {
  if (btnSend) btnSend.disabled = loading;
  sendSpinner?.classList.toggle("hidden", !loading);
  sendBtnText?.classList.toggle("hidden", loading);
}
function normalizeFontKey(fontKey) {
  return allowedFontKeys.has(fontKey) ? fontKey : "hand-caveat";
}
function normalizeBgKey(bgKey) {
  return allowedBgKeys.has(bgKey) ? bgKey : "paper";
}
function getSelectedStyleKey() {
  const selected = document.querySelector('input[name="letter-style"]:checked');
  return selected?.value || "en-1";
}
function getSelectedFontKey() {
  const style = styleToKeys[getSelectedStyleKey()] || styleToKeys["en-1"];
  return normalizeFontKey(style.font);
}
function getSelectedBgKey() {
  const style = styleToKeys[getSelectedStyleKey()] || styleToKeys["en-1"];
  return normalizeBgKey(style.bg);
}
function applyStyle(styleKey) {
  const style = styleToKeys[styleKey] || styleToKeys["en-1"];
  applyComposeFont(style.font);
  applyComposeBg(style.bg);
}
function applyComposeFont(fontKey) {
  if (!messageTextEl) return;
  const normalized = normalizeFontKey(fontKey);
  messageTextEl.classList.remove(
    "font-hand-caveat", "font-hand-patrick", "font-hand-kalam", "font-normal"
  );
  messageTextEl.classList.add(`font-${normalized}`);
}
function applyComposeBg(bgKey) {
  if (!letterFormCard) return;
  const normalized = normalizeBgKey(bgKey);
  letterFormCard.classList.remove(
    "letter-bg-paper", "letter-bg-rose", "letter-bg-mint", "letter-bg-sky"
  );
  letterFormCard.classList.add(`letter-bg-${normalized}`);
}
function containsBlockedWord(value) {
  const normalized = String(value || "").toLowerCase();
  return blockedWords.some(word => new RegExp(`\\b${word}\\b`, "i").test(normalized));
}
function copyToClipboard(text, btnEl) {
  if (!navigator.clipboard) return;

  navigator.clipboard.writeText(text).then(() => {
    const orig = btnEl.textContent;
    btnEl.textContent = "✓ Copied!";
    setTimeout(() => { btnEl.textContent = orig; }, 2000);
  });
}

// ─── Run ─────────────────────────────────────────────────────
init();
