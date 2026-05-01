// ============================================================
//  js/delete.js
//  Handles /d/TOKEN, /delete?token=TOKEN, and /delete.html?token=TOKEN — sender-initiated delete
// ============================================================

import { db } from "./firebase-config.js";
import {
  deleteDoc,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── DOM references ──────────────────────────────────────────
const loadingEl      = document.getElementById("delete-loading");
const confirmEl      = document.getElementById("delete-confirm");
const successEl      = document.getElementById("delete-success");
const notFoundEl     = document.getElementById("delete-not-found");
const previewEl      = document.getElementById("message-preview");
const statusEl       = document.getElementById("sender-letter-status");
const btnConfirm     = document.getElementById("btn-confirm-delete");
const deleteSpinner  = document.getElementById("delete-spinner");
const deleteBtnText  = document.getElementById("delete-btn-text");
const deleteErrorEl  = document.getElementById("delete-error");

// ─── Read token from URL ─────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const token  = params.get("token") || getTokenFromPath();

function getTokenFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const markerIndex = parts.lastIndexOf("d");
  const pathToken = markerIndex === -1 ? "" : parts[markerIndex + 1] || "";

  return /^[a-f0-9]{32}$/i.test(pathToken) ? pathToken.toLowerCase() : "";
}

// ─── Init ───────────────────────────────────────────────────
async function init() {
  if (!token) {
    showPanel("not-found");
    return;
  }

  try {
    // The token is also the document id, so we can fetch it directly.
    const msgRef = doc(db, "messages", token);
    const snap = await getDoc(msgRef);

    if (!snap.exists()) {
      showPanel("not-found");
      return;
    }

    // Found the message
    const msgData = snap.data();

    // Show a preview of the message text (truncated)
    const preview = msgData.text?.length > 200
      ? msgData.text.slice(0, 200) + "…"
      : msgData.text;
    previewEl.textContent = `"${preview}"`;
    previewEl.classList.add(fontClass(msgData.fontKey));
    previewEl.classList.add(bgClass(msgData.bgKey));
    await renderSenderStatus(msgData);

    showPanel("confirm");
  } catch (err) {
    console.error("Error finding message:", err);
    showPanel("not-found");
  }
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
    showError("Failed to delete the message. Please try again.");
    setLoading(false);
  }
});

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Show only one panel at a time.
 * @param {"loading"|"confirm"|"success"|"not-found"} name
 */
function showPanel(name) {
  loadingEl.classList.add("hidden");
  confirmEl.classList.add("hidden");
  successEl.classList.add("hidden");
  notFoundEl.classList.add("hidden");

  switch (name) {
    case "loading":   loadingEl.classList.remove("hidden"); break;
    case "confirm":   confirmEl.classList.remove("hidden"); break;
    case "success":   successEl.classList.remove("hidden"); break;
    case "not-found": notFoundEl.classList.remove("hidden"); break;
  }
}

function showError(msg) {
  deleteErrorEl.textContent = msg;
  deleteErrorEl.classList.remove("hidden");
}
function hideError() {
  deleteErrorEl.classList.add("hidden");
}
function setLoading(loading) {
  btnConfirm.disabled = loading;
  deleteSpinner.classList.toggle("hidden", !loading);
  deleteBtnText.classList.toggle("hidden", loading);
}
function fontClass(fontKey) {
  const allowedFontKeys = new Set(["hand-caveat", "hand-patrick", "hand-kalam", "normal"]);
  return `font-${allowedFontKeys.has(fontKey) ? fontKey : "hand-caveat"}`;
}
function bgClass(bgKey) {
  const allowedBgKeys = new Set(["paper", "rose", "mint", "sky"]);
  return `letter-bg-${allowedBgKeys.has(bgKey) ? bgKey : "paper"}`;
}

async function renderSenderStatus(msgData) {
  if (!statusEl) return;
  const reactionLabels = {
    heart: "They Loved this letter. ❤️",
    smile: "This letter made them Smile. 🤣",
    cry: "This letter made them Emotional. 😭",
    spark: "They marked this letter as Special. 🥰"
  };
  const lines = [];

  let recipientName = "recipient";
  try {
    const userDoc = await getDoc(doc(db, "users", msgData.toUserId));
    if (userDoc.exists()) {
      recipientName = userDoc.data().name || "recipient";
    }
  } catch (error) {
    console.error("Error fetching recipient name:", error);
  }

  if (msgData.isRead) {
    lines.push(`Seen by ${recipientName}.`);
  } else {
    lines.push("Delivered.");
  }

  if (msgData.receiverReaction && reactionLabels[msgData.receiverReaction]) {
    lines.push(reactionLabels[msgData.receiverReaction]);
  }
  if (msgData.replyText) lines.push(`Reply: ${msgData.replyText}`);

  if (!lines.length) {
    statusEl.classList.add("hidden");
    return;
  }

  statusEl.textContent = lines.join(" ");
  statusEl.classList.remove("hidden");
}

// ─── Run ─────────────────────────────────────────────────────
init();
