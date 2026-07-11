// ============================================================
//  js/auth.js
//  Handles: signup (2-step), login, session redirect
// ============================================================

import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Utility helpers ────────────────────────────────────────
function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
}
function hideError(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}
function setLoading(btnId, spinnerId, textId, loading) {
  const btn  = document.getElementById(btnId);
  const spin = document.getElementById(spinnerId);
  const txt  = document.getElementById(textId);
  if (!btn) return;
  btn.disabled = loading;
  if (spin) spin.classList.toggle("hidden", !loading);
  if (txt)  txt.classList.toggle("hidden", loading);
}

// ─── Determine which page we're on ───────────────────────────
const isSignup = document.getElementById("btn-signup")  !== null;
const isLogin  = document.getElementById("btn-login")   !== null;
const googleProvider = new GoogleAuthProvider();
const REF_STORAGE_KEY = "chithi_referral_code";

if (isSignup) captureReferralCode();

// ─── Redirect if already logged in ──────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Check if they have a username already
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    if (profileSnap.exists() && profileSnap.data().username) {
      // Already fully set up → go to dashboard
      window.location.href = "dashboard.html";
    } else if (isSignup) {
      // Partially registered → show username step
      showStep("step-username");
    } else if (isLogin) {
      // Google users may still need to choose a username
      window.location.href = "signup.html";
    }
  }
});

// ─── SIGNUP PAGE ─────────────────────────────────────────────
if (isSignup) {

  // Step 1: create account
  document.getElementById("btn-signup").addEventListener("click", async () => {
    hideError("auth-error");
    const email    = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    // Basic validation
    if (!email || !password) return showError("auth-error", "Please fill in all fields.");
    if (password.length < 6)  return showError("auth-error", "Password must be at least 6 characters.");

    setLoading("btn-signup", "signup-spinner", "signup-btn-text", true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // On success, onAuthStateChanged fires → shows username step
      showStep("step-username");
    } catch (err) {
      showError("auth-error", friendlyError(err.code));
      setLoading("btn-signup", "signup-spinner", "signup-btn-text", false);
    }
  });

  // Username live validation
  let usernameTimer = null;
  document.getElementById("username").addEventListener("input", (e) => {
    clearTimeout(usernameTimer);
    const val = e.target.value.trim().toLowerCase();
    const statusEl = document.getElementById("username-status");
    statusEl.textContent = "";
    statusEl.className = "field-status";

    if (!val) return;
    if (!/^[a-z0-9_]{3,20}$/.test(val)) {
      statusEl.textContent = "3-20 characters, letters/numbers/underscore only.";
      statusEl.classList.add("err");
      return;
    }
    statusEl.textContent = "Checking…";
    usernameTimer = setTimeout(async () => {
      const taken = await isUsernameTaken(val);
      if (taken) {
        statusEl.textContent = "That username is already taken.";
        statusEl.classList.add("err");
      } else {
        statusEl.textContent = "✓ Available!";
        statusEl.classList.add("ok");
      }
    }, 500);
  });

  // Step 2: save username
  document.getElementById("btn-save-username").addEventListener("click", async () => {
    hideError("username-error");
    const user = auth.currentUser;
    if (!user) return;

    const username = document.getElementById("username").value.trim().toLowerCase();
    const statusEl = document.getElementById("username-status");

    if (!username) return showError("username-error", "Please choose a username.");
    if (!/^[a-z0-9_]{3,20}$/.test(username))
      return showError("username-error", "3-20 characters, letters/numbers/underscore only.");

    setLoading("btn-save-username", "username-spinner", "username-btn-text", true);

    try {
      // Double-check uniqueness before saving
      const taken = await isUsernameTaken(username);
      if (taken) {
        showError("username-error", "That username was just taken. Try another.");
        setLoading("btn-save-username", "username-spinner", "username-btn-text", false);
        return;
      }

      await finishUserProfile(user, username);

      window.location.href = "dashboard.html";
    } catch (err) {
      console.error("Username save error:", err);
      showError("username-error", usernameSaveError(err));
      setLoading("btn-save-username", "username-spinner", "username-btn-text", false);
    }
  });

  document.getElementById("btn-google-signup")?.addEventListener("click", async () => {
    await handleGoogleAuth("signup");
  });
}

// ─── LOGIN PAGE ──────────────────────────────────────────────
if (isLogin) {
  document.getElementById("btn-login").addEventListener("click", async () => {
    hideError("auth-error");
    const email    = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) return showError("auth-error", "Please enter your email and password.");

    setLoading("btn-login", "login-spinner", "login-btn-text", true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "dashboard.html";
    } catch (err) {
      showError("auth-error", friendlyError(err.code));
      setLoading("btn-login", "login-spinner", "login-btn-text", false);
    }
  });

  // Allow Enter key to submit
  ["email", "password"].forEach(id => {
    document.getElementById(id)?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("btn-login").click();
    });
  });

  document.getElementById("btn-google-login")?.addEventListener("click", async () => {
    await handleGoogleAuth("login");
  });

  document.getElementById("btn-reset-password")?.addEventListener("click", async () => {
    hideError("auth-error");
    const email = document.getElementById("email").value.trim();
    if (!email) return showError("auth-error", "Enter your email first, then tap Forgot password.");

    try {
      await sendPasswordResetEmail(auth, email);
      showError("auth-error", "Password reset email sent. Check your inbox or Spam Folder.");
    } catch (err) {
      showError("auth-error", friendlyError(err.code));
    }
  });
}

// ─── Helpers ─────────────────────────────────────────────────

async function handleGoogleAuth(mode) {
  hideError("auth-error");
  const btnId = mode === "signup" ? "btn-google-signup" : "btn-google-login";
  setGoogleLoading(btnId, true);

  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const profileSnap = await getDoc(doc(db, "users", user.uid));

    if (profileSnap.exists() && profileSnap.data().username) {
      window.location.href = "dashboard.html";
      return;
    }

    if (mode === "signup") {
      showStep("step-username");
    } else {
      window.location.href = "signup.html";
    }
  } catch (err) {
    showError("auth-error", friendlyError(err.code));
  } finally {
    setGoogleLoading(btnId, false);
  }
}

function captureReferralCode() {
  const params = new URLSearchParams(window.location.search);
  const ref = normalizeReferralCode(params.get("ref"));
  if (!ref) return;

  try {
    sessionStorage.setItem(REF_STORAGE_KEY, ref);
  } catch (_) { /* sessionStorage may be unavailable */ }

  const hint = document.getElementById("referral-hint");
  const codeEl = document.getElementById("referral-code-preview");
  if (hint && codeEl) {
    codeEl.textContent = ref;
    hint.classList.remove("hidden");
  }
}

function getStoredReferralCode() {
  try {
    return normalizeReferralCode(sessionStorage.getItem(REF_STORAGE_KEY));
  } catch (_) {
    return "";
  }
}

function clearStoredReferralCode() {
  try {
    sessionStorage.removeItem(REF_STORAGE_KEY);
  } catch (_) { /* non-fatal */ }
}

function normalizeReferralCode(code) {
  return (code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 28);
}

function buildReferralCode(username) {
  return `${username.replace(/_/g, "").toUpperCase()}2k26`.slice(0, 28);
}

async function finishUserProfile(user, username) {
  const referralCode = buildReferralCode(username);
  const userRef = doc(db, "users", user.uid);
  const usernameRef = doc(db, "usernames", username);

  await runTransaction(db, async (transaction) => {
    const usernameSnap = await transaction.get(usernameRef);

    if (usernameSnap.exists()) throw new Error("username-taken");

    transaction.set(userRef, {
      uid: user.uid,
      email: user.email,
      username,
      displayName: username,
      bio: "",
      avatarColor: "#2c1e0f",
      photoData: null,
      customEmojis: ["💌", "✨", "💕", "🎈", "📝", "❤️", "📫", "🎉", "💝", "🌸"],
      theme: "default",
      referralCode,
      referralCount: 0,
      unlockedThemes: ["default"],
      unlockedPerks: [],
      referralTier: "Starter",
      createdAt: serverTimestamp()
    });

    transaction.set(usernameRef, { uid: user.uid });
  });

  await saveReferralArtifacts(user, username, referralCode);
  clearStoredReferralCode();
}

async function saveReferralArtifacts(user, username, referralCode) {
  const incomingCode = getStoredReferralCode();

  try {
    await setDoc(doc(db, "referralCodes", referralCode), {
      uid: user.uid,
      username,
      code: referralCode,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.warn("Referral code setup skipped:", err);
  }

  if (!incomingCode) return;

  try {
    const incomingSnap = await getDoc(doc(db, "referralCodes", incomingCode));
    if (!incomingSnap.exists()) {
      console.warn(`Referral code ${incomingCode} was not found. Ask the referrer to open their dashboard once.`);
      return;
    }
    if (incomingSnap.data().uid === user.uid) return;

    await setDoc(doc(db, "referrals", user.uid), {
      referredUid: user.uid,
      referredUsername: username,
      referrerUid: incomingSnap.data().uid,
      referrerUsername: incomingSnap.data().username || "",
      referrerCode: incomingCode,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.warn("Referral tracking skipped:", err);
  }
}

function usernameSaveError(err) {
  if (err?.message === "username-taken") return "That username was just taken. Try another.";
  if (err?.code === "permission-denied") {
    return "Could not save username because Firestore rules blocked the write.";
  }
  return "Error saving username. Please try again.";
}

function setGoogleLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.querySelector("span:last-child").textContent = loading ? "Connecting..." : "Continue with Google";
}

/** Check if a username already exists in the usernames collection */
async function isUsernameTaken(username) {
  const snap = await getDoc(doc(db, "usernames", username));
  return snap.exists();
}

/** Password visibility */
document.querySelectorAll(".password-wrap").forEach(wrapper => {
  const input = wrapper.querySelector("input");
  const toggle = wrapper.querySelector(".toggle-eye");

  toggle?.addEventListener("click", () => {
    const type = input.type === "password" ? "text" : "password";
    input.type = type;
    toggle.textContent = type === "password" ? "👁️" : "🙈";
  });
});

/** Reset Password */
// ─── RESET PASSWORD (separate page) ─────────────────────────
const resetBtn = document.getElementById("btn-send-reset");

resetBtn?.addEventListener("click", async () => {
  hideError("auth-error");

  const emailInput = document.getElementById("reset-email");
  const email = emailInput?.value?.trim();

  if (!email) {
    showError("auth-error", "Please enter your Email first.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);

    showError(
      "auth-error",
      "📩 Reset link sent! Check your email (Inbox/Spam)."
    );

  } catch (err) {
    console.error(err);
    showError("auth-error", friendlyError(err.code));
  }
});

/** Show a specific step div (signup is multi-step) */
function showStep(stepId) {
  document.querySelectorAll("[id^='step-']").forEach(el => el.classList.add("hidden"));
  const target = document.getElementById(stepId);
  if (target) target.classList.remove("hidden");
}

/** Convert Firebase error codes to friendly messages */
function friendlyError(code) {
  switch (code) {
    case "auth/email-already-in-use":    return "This email is already registered. Try signing in.";
    case "auth/invalid-email":           return "Please enter a valid email address.";
    case "auth/weak-password":           return "Password should be at least 6 characters.";
    case "auth/user-not-found":          return "No account found with that email.";
    case "auth/wrong-password":          return "Incorrect password. Please try again.";
    case "auth/invalid-credential":      return "Incorrect email or password.";
    case "auth/popup-closed-by-user":     return "Google sign-in was closed before it finished.";
    case "auth/cancelled-popup-request":  return "Google sign-in was cancelled. Please try again.";
    case "auth/popup-blocked":            return "Your browser blocked the Google sign-in popup.";
    case "auth/unauthorized-domain":      return "This website domain is not allowed in Firebase Authentication settings.";
    case "auth/operation-not-allowed":     return "Google sign-in is not enabled in Firebase Authentication.";
    case "auth/too-many-requests":       return "Too many attempts. Please wait a moment and try again.";
    default:                             return "Something went wrong. Please try again.";
  }
}
