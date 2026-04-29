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
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Read username from URL ──────────────────────────────────
// URL format: /user.html?u=username
const params   = new URLSearchParams(window.location.search);
const username = params.get("u");

// ─── DOM references ──────────────────────────────────────────
const loadingEl      = document.getElementById("user-loading");
const notFoundEl     = document.getElementById("user-not-found");
const formWrapEl     = document.getElementById("user-form-wrap");
const usernameDisplay= document.getElementById("username-display");
const avatarCircle   = document.getElementById("avatar-circle");
const messageTextEl  = document.getElementById("message-text");
const fontSelectEl   = document.getElementById("font-select");
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
const allowedFontKeys = new Set(["hand-caveat", "hand-patrick", "hand-kalam", "normal"]);

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
    usernameDisplay.textContent = userData.username;
    avatarCircle.textContent    = userData.username.charAt(0).toUpperCase();
    document.title              = `Send a letter to ${userData.username} — Chithi`;

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

fontSelectEl?.addEventListener("change", () => {
  applyComposeFont(fontSelectEl.value);
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
  const fontKey    = normalizeFontKey(fontSelectEl?.value);

  // Validate
  if (!text) return showError("Please write something before sending.");
  if (text.length > 1000) return showError("Message is too long (max 1000 characters).");
  if (!isAnonymous && !senderName) return showError("Please enter your name, or switch to anonymous.");
  if (!targetUserId) return showError("Something went wrong. Please reload the page.");

  setLoading(true);

  try {
    // Generate a random delete token (32-char hex string)
    const deleteToken = generateToken();

    // expireAt = now + 30 days
    const expireAt = Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    // Store the message under its delete token so the sender can unsend
    // it later without needing a collection query that rules can't verify.
    await setDoc(doc(db, "messages", deleteToken), {
      toUserId:    targetUserId,
      text:        text,
      senderName:  isAnonymous ? "" : senderName,
      isAnonymous: isAnonymous,
      fontKey:     fontKey,
      deleteToken: deleteToken,
      createdAt:   serverTimestamp(),
      expireAt:    expireAt
    });

    // Build delete URL
    const baseUrl   = window.location.origin + window.location.pathname.replace("user.html", "");
    const deleteUrl = `${baseUrl}delete.html?token=${deleteToken}`;
    deleteLinkEl.textContent = deleteUrl;

    // Show success
    formContainerEl.classList.add("hidden");
    successEl.classList.remove("hidden");

    // Copy delete link button
    btnCopyDelete?.addEventListener("click", () => {
      copyToClipboard(deleteUrl, btnCopyDelete);
    });

  } catch (err) {
    console.error("Send error:", err);
    showError("Failed to send message. Please try again.");
  } finally {
    setLoading(false);
  }
});

// ─── Send another ────────────────────────────────────────────
btnSendAnother?.addEventListener("click", () => {
  // Reset form
  messageTextEl.value   = "";
  senderNameEl.value    = "";
  if (fontSelectEl) fontSelectEl.value = "hand-caveat";
  applyComposeFont("hand-caveat");
  anonToggle.checked    = true;
  senderNameGroup.style.display = "none";
  charCountEl.textContent = "0";
  successEl.classList.add("hidden");
  formContainerEl.classList.remove("hidden");
});

// ─── Helpers ─────────────────────────────────────────────────

/** Generate a cryptographically random token */
function generateToken() {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
}

function showError(msg) {
  sendError.textContent = msg;
  sendError.classList.remove("hidden");
}
function hideError() {
  sendError.classList.add("hidden");
}
function setLoading(loading) {
  btnSend.disabled = loading;
  sendSpinner.classList.toggle("hidden", !loading);
  sendBtnText.classList.toggle("hidden", loading);
}
function normalizeFontKey(fontKey) {
  return allowedFontKeys.has(fontKey) ? fontKey : "hand-caveat";
}
function applyComposeFont(fontKey) {
  const normalized = normalizeFontKey(fontKey);
  messageTextEl.classList.remove("font-hand-caveat", "font-hand-patrick", "font-hand-kalam", "font-normal");
  messageTextEl.classList.add(`font-${normalized}`);
}
function copyToClipboard(text, btnEl) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btnEl.textContent;
    btnEl.textContent = "✓ Copied!";
    setTimeout(() => { btnEl.textContent = orig; }, 2000);
  });
}

// ─── Run ─────────────────────────────────────────────────────
applyComposeFont(fontSelectEl?.value || "hand-caveat");
init();
