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
const btnCopyCode    = document.getElementById("btn-copy-code");
const btnSendAnother = document.getElementById("btn-send-another");
const sendCooldownText = document.getElementById("send-cooldown-text");

// ─── State ──────────────────────────────────────────────────
let targetUserId = null;
const allowedFontKeys = new Set([
  "hand-caveat", "hand-patrick", "hand-kalam", "normal"
]);
const allowedBgKeys = new Set([
  "paper", "rose", "mint", "sky"
]);
const styleToKeys = {
  "en-1": { font: "hand-patrick", bg: "rose" },
  "en-2": { font: "hand-kalam", bg: "mint" },
  "en-3": { font: "normal", bg: "sky" },
  "en-4": { font: "hand-caveat", bg: "paper" }
};
// ─── Profanity filter (bypass-proof) ────────────────────────
// Strips zero-width chars, collapses repeated chars, normalises
// leet-speak substitutions, then checks against blocked roots.
const blockedRoots = [
  "fuck", "shit", "bitch", "asshole", "bastard", "slut", "whore",
  "madarchod", "madarchut", "maderchod", "maderchut", "bhosdike", "vosdike",
  "chod", "chud", "choda", "chudi", "khanki", "kanki", "bal", "bokachoda",
  // common leet roots kept here in plain form so the normaliser handles variants
  "cunt", "nigger", "nigga", "faggot", "retard", "dick", "cock", "pussy",
  "মাদারচোদ", "মাগী", "খানকি", "বাল", "চুদ", "চোদ"
];

const leetMap = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s",
  "6": "g", "7": "t", "8": "b", "9": "g",
  "@": "a", "$": "s", "!": "i", "+": "t",
  "(": "c", ")": "o", "|": "i", "<": "c", ">": "o",
  "а": "a", "е": "e", "і": "i", "о": "o", "р": "p", "с": "c", "х": "x",
  "Ａ": "a", "Ｂ": "b", "Ｃ": "c", "Ｄ": "d", "Ｅ": "e", "Ｆ": "f",
  "Ｉ": "i", "Ｋ": "k", "Ｏ": "o", "Ｓ": "s", "Ｔ": "t", "Ｕ": "u"
};

function normalizeText(value) {
  let s = String(value || "");

  // 0. Canonicalize full-width text and strip combining marks.
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  // 1. Strip zero-width & invisible Unicode (ZWJ, ZWNJ, soft-hyphen, etc.)
  // eslint-disable-next-line no-misleading-character-class
  s = s.replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u034F\u180E]/g, "");

  // 2. Leet-speak and common lookalike substitution.
  s = s.split("").map(c => leetMap[c] ?? c).join("");

  // 3. Remove separators so "f u c k", "f*u*c*k", "f-u-c-k" collapse.
  s = s.replace(/[^a-z0-9\u0980-\u09FF]+/g, "");

  // 4. Collapse sequences of the same letter (fuuuck → fuck, shhit → shit)
  s = s.replace(/(.)\1+/g, "$1");

  return s;
}

function containsBlockedWord(value) {
  const normalized = normalizeText(value);
  return blockedRoots.some(root => normalized.includes(normalizeText(root)));
}

// ─── Send cooldown (30 s) ────────────────────────────────────
const COOLDOWN_MS = 30_000;
const COOLDOWN_KEY = `chithi_send_cooldown_${username || "unknown"}`;
let cooldownTimer = null;

function getCooldownRemaining() {
  const until = Number(localStorage.getItem(COOLDOWN_KEY) || 0);
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

function isCoolingDown() {
  return getCooldownRemaining() > 0;
}

function startCooldown(durationMs = COOLDOWN_MS) {
  localStorage.setItem(COOLDOWN_KEY, String(Date.now() + durationMs));
  tickCooldown();

  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer = setInterval(tickCooldown, 1000);
}

function tickCooldown() {
  const remaining = getCooldownRemaining();

  if (remaining <= 0) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
    localStorage.removeItem(COOLDOWN_KEY);
    if (btnSend) btnSend.disabled = false;
    if (sendBtnText) sendBtnText.textContent = "Send Letter 💌";
   // if (sendCooldownText) sendCooldownText.textContent = "";
    btnSendAnother?.classList.remove("hidden");
    return;
  }

  if (btnSend) btnSend.disabled = true;
  if (sendBtnText) sendBtnText.textContent = `Wait ${remaining}s…`;
  if (sendCooldownText) sendCooldownText.textContent = `Wait ${remaining} sec`;
  btnSendAnother?.classList.add("hidden");
}

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

  if (isCoolingDown()) {
    tickCooldown();
    return showError(`Please wait ${getCooldownRemaining()}s before sending another letter.`);
  }

  const text        = messageTextEl.value.trim();
  const isAnonymous = anonToggle.checked;
  const senderName  = senderNameEl.value.trim();
  const fontKey     = getSelectedFontKey();
  const bgKey       = getSelectedBgKey();

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
  const shortCode = generateShortCode(deleteToken);

  try {
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

    // Save to localStorage for the tracking page
    saveToLocalStorage(deleteToken, shortCode, username, text.slice(0, 80));

  } catch (err) {
    console.error("Send error:", err);
    showError("Failed to send message. Please try again.");
    setLoading(false);
    return;
  }

  setLoading(false);
  showSendSuccess(deleteToken, shortCode);
  startCooldown();
});

function showSendSuccess(deleteToken, shortCode) {
  try {
    const deleteUrl = buildDeleteUrl(deleteToken);

    if (deleteLinkEl) deleteLinkEl.textContent = deleteUrl;
      const shortCodeEl = document.getElementById("short-code-display");
    if (shortCodeEl) shortCodeEl.textContent = shortCode || deleteToken.slice(0, 4).toUpperCase();
    formContainerEl?.classList.add("hidden");
    successEl?.classList.remove("hidden");

    playSuccessPlane();

    if (btnCopyDelete) {
      btnCopyDelete.onclick = () => copyToClipboard(deleteUrl, btnCopyDelete);
    }

    if (btnCopyCode) {
      btnCopyCode.onclick = () => copyToClipboard(shortCode, btnCopyCode);
    }
  } catch (err) {
    // The message has already been saved at this point. Do not show a send
    // failure for a post-send UI problem.
    console.error("Post-send UI error:", err);
    formContainerEl?.classList.add("hidden");
    successEl?.classList.remove("hidden");

    playSuccessPlane();
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
  if (isCoolingDown()) return tickCooldown();
  if (btnSend) btnSend.disabled = false;
  if (sendBtnText) sendBtnText.textContent = "Send Letter 💌";
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

function saveToLocalStorage(token, shortCode, toUsername, textPreview) {
  try {
    const LS_KEY = "chithi_sent_letters";
    const existing = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    existing.push({ token, shortCode, toUsername, preview: textPreview, sentAt: new Date().toISOString() });
    if (existing.length > 50) existing.splice(0, existing.length - 50);
    localStorage.setItem(LS_KEY, JSON.stringify(existing));
  } catch (_) {}
}

function generateShortCode(token) {
  const chars = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 34 chars, 
  const bytes = token.match(/.{2}/g).slice(0, 4).map(h => parseInt(h, 16));
  return bytes.map(b => chars[b % chars.length]).join("");
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
  if (btnSend) btnSend.disabled = loading || isCoolingDown();
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
// containsBlockedWord and normalizeText defined above near blockedRoots
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
if (isCoolingDown()) {
  tickCooldown();
  cooldownTimer = setInterval(tickCooldown, 1000);
}
