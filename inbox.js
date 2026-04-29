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
  getDoc
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

let unsubscribeMessages = null; // Firestore listener cleanup
const allowedFontKeys = new Set(["hand-caveat", "hand-patrick", "hand-kalam", "normal"]);

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
  const username = profile.username;

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

// ─── Load messages (real-time listener) ──────────────────────
function loadMessages(uid) {
  const q = query(
    collection(db, "messages"),
    where("toUserId", "==", uid)
  );

  // onSnapshot = real-time updates whenever messages change
  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    inboxLoadingEl.classList.add("hidden");

    if (snapshot.empty) {
      inboxEmptyEl.classList.remove("hidden");
      messagesListEl.classList.add("hidden");
      inboxCountEl.textContent = "0 messages";
      return;
    }

    inboxEmptyEl.classList.add("hidden");
    messagesListEl.classList.remove("hidden");

    const count = snapshot.size;
    inboxCountEl.textContent = `${count} ${count === 1 ? "message" : "messages"}`;

    const docs = snapshot.docs.slice().sort((a, b) => {
      const aTime = a.data().createdAt?.toMillis?.() || 0;
      const bTime = b.data().createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });

    // Render all messages
    messagesListEl.innerHTML = "";
    docs.forEach(docSnap => {
      messagesListEl.appendChild(buildMessageCard(docSnap));
    });
  }, (err) => {
    console.error("Error loading messages:", err);
    inboxLoadingEl.innerHTML = "<p>Error loading messages. Please refresh.</p>";
  });
}

// ─── Build a single message card ────────────────────────────
function buildMessageCard(docSnap) {
  const msg  = docSnap.data();
  const card = document.createElement("div");
  card.className = "message-card";
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
    <div class="message-text ${fontClass(msg.fontKey)}">${escapeHtml(msg.text)}</div>
    <div class="message-meta">
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
        ${senderHTML}
        <span class="message-date">${date}</span>
      </div>
      <button class="btn-delete" data-id="${docSnap.id}" title="Delete this message">
        🗑 Delete
      </button>
    </div>
  `;

  // Delete button handler
  card.querySelector(".btn-delete").addEventListener("click", async (e) => {
    const msgId = e.currentTarget.dataset.id;
    if (!confirm("Delete this message? This can't be undone.")) return;
    try {
      await deleteDoc(doc(db, "messages", msgId));
      // Real-time listener will update the list automatically
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete message. Please try again.");
    }
  });

  return card;
}

// ─── Logout ──────────────────────────────────────────────────
btnLogout?.addEventListener("click", async () => {
  // Clean up Firestore listener before leaving
  if (unsubscribeMessages) unsubscribeMessages();
  await signOut(auth);
  window.location.href = "index.html";
});

// ─── Helpers ─────────────────────────────────────────────────

/** Format a JS Date into a readable string */
function formatDate(date) {
  const now  = new Date();
  const diff = (now - date) / 1000; // seconds

  if (diff < 60)           return "Just now";
  if (diff < 3600)         return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)        return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7)    return `${Math.floor(diff / 86400)}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  });
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
