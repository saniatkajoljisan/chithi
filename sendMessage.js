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
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Read username from URL ──────────────────────────────────
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

// ─── State ──────────────────────────────────────────────────
let targetUserId = null;
let targetUserData = null;

// ─── Cooldown (30 seconds between sends) ────────────────────
const COOLDOWN_MS = 30000;
let cooldownTimer = null;
let cooldownInterval = null;

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

// ─── Strong blocked words (not bypassable) ──────────────────
// Covers: leet speak, repeated chars, spaced chars, zero-width
const rawBlockedWords = [
  "fuck", "shit", "bitch", "asshole", "bastard", "slut", "whore",
  "cunt", "cock", "dick", "pussy", "nigger", "nigga", "faggot",
  "retard", "rape", "madarchod", "bhosdike", "chod", "khanki",
  "harami", "randi", "sala", "magi", "bokachoda", "chutiya",
  "gandu", "lavda", "lund", "lauda", "bhosdi", "madar"
];

function normalizeText(str) {
  return String(str || "")
    // Remove zero-width and invisible characters
    .replace(/[\u200B-\u200D\uFEFF\u00AD\u2060]/g, "")
    // Remove all spaces and punctuation between letters (f u c k → fuck)
    .replace(/[\s\-_.,!@#$%^&*()]+/g, "")
    // Leet speak map
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/\+/g, "t")
    // Collapse repeated characters (fuuuck → fuck, shhit → shit)
    .replace(/(.)\1+/g, "$1")
    .toLowerCase();
}

function containsBlockedWord(value) {
  const normalized = normalizeText(value);
  // Also check original lowercased for boundary matching
  const original = String(value || "").toLowerCase().replace(/[\u200B-\u200D\uFEFF\u00AD\u2060]/g, "");
  return rawBlockedWords.some(word => {
    const normWord = normalizeText(word);
    // Check in normalized (catches leet/spaces/repeats)
    if (normalized.includes(normWord)) return true;
    // Check in original with word boundaries
    if (new RegExp(`\\b${word}\\b`, "i").test(original)) return true;
    return false;
  });
}

// ─── Init ───────────────────────────────────────────────────
async function init() {
  if (!username) { showNotFound(); return; }

  try {
    const q = query(collection(db, "users"), where("username", "==", username.toLowerCase()));
    const snap = await getDocs(q);
    if (snap.empty) { showNotFound(); return; }

    targetUserData = snap.docs[0].data();
    targetUserId   = targetUserData.uid;

    const displayName = targetUserData.displayName || targetUserData.username;
    usernameDisplay.textContent = displayName;
    avatarCircle.textContent    = displayName.charAt(0).toUpperCase();
    avatarCircle.style.background = targetUserData.avatarColor || "#2c1e0f";
    if (userTaglineEl) {
      userTaglineEl.textContent = targetUserData.bio || "They won't know who you are unless you tell them.";
    }
    document.title = `Send a letter to ${displayName} — Chithi`;

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
  const shortCode   = generateShortCode(deleteToken);

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
  startCooldown();
  showSendSuccess(deleteToken, shortCode);
});

// ─── Cooldown logic ─────────────────────────────────────────
function startCooldown() {
  if (cooldownInterval) clearInterval(cooldownInterval);
  if (cooldownTimer)    clearTimeout(cooldownTimer);

  let remaining = COOLDOWN_MS / 1000;

  const cooldownBar   = document.getElementById("cooldown-bar");
  const cooldownCount = document.getElementById("cooldown-count");

  // Show cooldown bar and disable send button
  if (btnSend)      btnSend.disabled = true;
  if (cooldownBar)  { cooldownBar.classList.add("active"); }
  if (cooldownCount) cooldownCount.textContent = remaining;

  // Also disable send-another
  if (btnSendAnother) btnSendAnother.disabled = true;

  cooldownInterval = setInterval(() => {
    remaining--;
    if (cooldownCount) cooldownCount.textContent = remaining;
    if (btnSendAnother) btnSendAnother.textContent = `Wait ${remaining}s...`;

    if (remaining <= 0) {
      clearInterval(cooldownInterval);
      // Re-enable everything
      if (btnSend)       btnSend.disabled = false;
      if (cooldownBar)   cooldownBar.classList.remove("active");
      if (btnSendAnother) {
        btnSendAnother.disabled    = false;
        btnSendAnother.textContent = "Send another →";
      }
    }
  }, 1000);
}

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
  if (messageTextEl)  messageTextEl.value = "";
  if (senderNameEl)   senderNameEl.value  = "";

  const defaultStyleOption = document.querySelector('input[name="letter-style"][value="en-1"]');
  if (defaultStyleOption) defaultStyleOption.checked = true;

  if (anonToggle)      anonToggle.checked = true;
  if (senderNameGroup) senderNameGroup.style.display = "none";
  if (charCountEl)     charCountEl.textContent = "0";
  if (successEl)       successEl.classList.add("hidden");
  if (formContainerEl) formContainerEl.classList.remove("hidden");
});

// ─── Helpers ─────────────────────────────────────────────────

function generateToken() {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
}

function generateShortCode(token) {
  const chars = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 34 chars, no I/O confusion
  const bytes = token.match(/.{2}/g).slice(0, 4).map(h => parseInt(h, 16));
  return bytes.map(b => chars[b % chars.length]).join("");
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

function showError(msg) {
  if (!sendError) return;
  sendError.textContent = msg;
  sendError.classList.remove("hidden");
}
function hideError() { sendError?.classList.add("hidden"); }
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
  messageTextEl.classList.remove("font-hand-caveat","font-hand-patrick","font-hand-kalam","font-normal");
  messageTextEl.classList.add(`font-${normalized}`);
}
function applyComposeBg(bgKey) {
  if (!letterFormCard) return;
  const normalized = normalizeBgKey(bgKey);
  letterFormCard.classList.remove("letter-bg-paper","letter-bg-rose","letter-bg-mint","letter-bg-sky");
  letterFormCard.classList.add(`letter-bg-${normalized}`);
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
