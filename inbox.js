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
  setDoc,
  updateDoc,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  THEMES,
  THEME_CHANGE_EVENT,
  THEME_UNLOCK_LEVELS,
  CUSTOMIZABLE_THEME,
  applyTheme,
  cacheThemeLocally,
  getCachedTheme,
  getUnlockedThemes,
  isThemeUnlocked,
  cacheGardenColorsLocally,
  getCachedGardenColors
} from "./themes.js";

// ─── DOM references ──────────────────────────────────────────
const navUsernameEl  = document.getElementById("nav-username");
const userLinkEl     = document.getElementById("user-link");
const btnCopyLink    = document.getElementById("btn-copy-link");
const btnOpenQrModal  = document.getElementById("btn-open-qr");
const qrModalEl      = document.getElementById("qr-modal");
const qrPreviewEl    = document.getElementById("qr-preview");
const qrAvatarToggleEl = document.getElementById("qr-include-avatar");
const qrSloganInputEl = document.getElementById("qr-slogan");
const btnDownloadQr  = document.getElementById("btn-download-qr");
const btnDownloadPoster = document.getElementById("btn-download-poster");
const btnCloseQrModal = document.getElementById("btn-close-qr");
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
const profileEmojisEl = document.getElementById("profile-emojis");
const emojiStatusEl = document.getElementById("emoji-status");
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
const referralPanelEl = document.getElementById("referral-panel");
const referralSummaryEl = document.getElementById("referral-summary");
const referralDetailsEl = document.getElementById("referral-details");
const btnCloseReferral = document.getElementById("btn-close-referral");
const referralTagsEl = document.getElementById("referral-tags");
const referralTierEl = document.getElementById("referral-tier");
const referralCodeEl = document.getElementById("referral-code");
const referralLinkEl = document.getElementById("referral-link");
const btnCopyReferral = document.getElementById("btn-copy-referral");
const referralCountEl = document.getElementById("referral-count");
const referralNextEl = document.getElementById("referral-next");
const referralProgressFillEl = document.getElementById("referral-progress-fill");
const referralMilestonesEl = document.getElementById("referral-milestones");
const themeChoiceGridEl = document.getElementById("theme-choice-grid");
const themeStatusEl = document.getElementById("theme-status");
const gardenColorPickerEl = document.getElementById("garden-color-picker");
const gardenBgInputEl     = document.getElementById("garden-color-bg");
const gardenInkInputEl    = document.getElementById("garden-color-ink");
const gardenAccentInputEl = document.getElementById("garden-color-accent");
let currentGardenColors = null;
const profileVipTickEl = document.getElementById("profile-vip-tick");
const profileRewardEmojiEl = document.getElementById("profile-reward-emoji");

let unsubscribeMessages = null; // Firestore listener cleanup
let currentUser = null;
let currentProfile = null;
let currentReferralCount = 0;
let qrCodeInstance = null;
let activeQrLink = "";
let currentUnlockedThemes = ["default"];
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
const REFERRAL_MILESTONES = [
  { count: 3, tier: "Basic", label: "Basic themes", detail: "Candy Pop + Soft Pastel + Dark Mode" },
  { count: 10, tier: "Social", label: "Animated emoji", detail: "Avatar frame + Customised Floating Emoji" },
  { count: 25, tier: "VIP", label: "VIP badge", detail: "Blue Verified Tick + Neon Cyberpunk Mode" },
  { count: 50, tier: "Private", label: "Private theme", detail: "Exclusive Private Garden" }
];
const DEFAULT_FLOATING_EMOJIS = ["💌", "✨", "💕", "🎈", "📝", "❤️", "📫", "🎉", "💝", "🌸"];

applyTheme(getCachedTheme());

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
  await hydrateReferralState(user.uid, profile);
  hydrateProfileForm(profile);

  // Update nav
  navUsernameEl.textContent = `@${username}`;

  // Build and display the public link
  const userLink = window.ChithiUrl?.publicUser(username)
    || `${window.location.origin}/user.html?u=${username}`;
  userLinkEl.textContent = userLink;
  activeQrLink = userLink;
  renderQrCode(userLink);

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
    renderQrCode(activeQrLink || userLinkEl?.textContent || "");
  });
});
btnSaveProfile?.addEventListener("click", saveProfile);
btnEditProfile?.addEventListener("click", showProfileEdit);
btnOpenQrModal?.addEventListener("click", () => {
  if (!activeQrLink) return;
  qrModalEl?.classList.remove("hidden");
  document.body.classList.add("modal-open");
  renderQrCode(activeQrLink);
});
btnCloseQrModal?.addEventListener("click", closeQrModal);
qrModalEl?.querySelectorAll("[data-close-qr]").forEach((el) => {
  el.addEventListener("click", closeQrModal);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeQrModal();
});
qrAvatarToggleEl?.addEventListener("change", () => {
  renderQrCode(activeQrLink);
});
qrSloganInputEl?.addEventListener("input", () => {
  if (qrModalEl && !qrModalEl.classList.contains("hidden")) {
    renderQrCode(activeQrLink);
  }
});
btnDownloadQr?.addEventListener("click", downloadQrCode);
btnDownloadPoster?.addEventListener("click", downloadPoster);
document.addEventListener(THEME_CHANGE_EVENT, () => {
  if (!qrModalEl?.classList.contains("hidden")) {
    renderQrCode(activeQrLink);
  }
});
btnCancelProfile?.addEventListener("click", cancelProfileEdit);
btnShowDeleteAccount?.addEventListener("click", showDeleteAccountConfirm);
btnCancelDeleteAccount?.addEventListener("click", cancelDeleteAccountConfirm);
btnDeleteAccount?.addEventListener("click", handleDeleteAccount);
btnCopyReferral?.addEventListener("click", copyReferralLink);
referralSummaryEl?.addEventListener("click", () => toggleReferralPanel());
referralSummaryEl?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    toggleReferralPanel();
  }
});
btnCloseReferral?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleReferralPanel(false);
});

function toggleReferralPanel(forceExpand) {
  const isExpanded = referralPanelEl?.classList.contains("expanded");
  const expand = typeof forceExpand === "boolean" ? forceExpand : !isExpanded;
  referralPanelEl?.classList.toggle("expanded", expand);
  referralDetailsEl?.classList.toggle("hidden", !expand);
  referralSummaryEl?.setAttribute("aria-expanded", String(expand));
}
profileEmojisEl?.addEventListener("input", () => {
  if (profileEmojisEl.disabled) return;
  const emojis = parseCustomEmojis(profileEmojisEl.value);
  updateFloatingEmojis(emojis);
  setEmojiStatus(`${emojis.length || DEFAULT_FLOATING_EMOJIS.length} emojis will float after saving.`, false);
});

async function hydrateReferralState(uid, profile) {
  try {
    const referralSnap = await getDocs(query(
      collection(db, "referrals"),
      where("referrerUid", "==", uid)
    ));
    currentReferralCount = referralSnap.size;
  } catch (err) {
    console.error("Referral count error:", err);
    currentReferralCount = Number(profile.referralCount) || 0;
  }

  const rewards = getReferralRewards(currentReferralCount);
  currentUnlockedThemes = getUnlockedThemes(currentReferralCount);
  const referralCode = profile.referralCode || buildReferralCode(profile.username || "");
  const selectedTheme = isThemeUnlocked(profile.theme || "default", currentUnlockedThemes)
    ? (profile.theme || "default")
    : "default";

  currentGardenColors = profile.privateGardenColors || getCachedGardenColors() || null;

  currentProfile = {
    ...profile,
    referralCode,
    referralCount: currentReferralCount,
    unlockedThemes: currentUnlockedThemes,
    unlockedPerks: rewards.perks,
    referralTier: rewards.tier,
    theme: selectedTheme
  };

  applyTheme(selectedTheme, selectedTheme === CUSTOMIZABLE_THEME ? currentGardenColors : undefined);
  cacheThemeLocally(selectedTheme);
  if (selectedTheme === CUSTOMIZABLE_THEME && currentGardenColors) {
    cacheGardenColorsLocally(currentGardenColors);
  }
  renderReferralPanel(currentProfile);
  renderQrCode(activeQrLink || userLinkEl?.textContent || "");
  await ensureReferralCodeLookup(uid, currentProfile.username, referralCode);

  try {
    await updateDoc(doc(db, "users", uid), {
      referralCode,
      referralCount: currentReferralCount,
      unlockedThemes: currentUnlockedThemes,
      unlockedPerks: rewards.perks,
      referralTier: rewards.tier,
      theme: selectedTheme
    });
  } catch (err) {
    console.error("Referral reward sync error:", err);
  }
}

async function ensureReferralCodeLookup(uid, username, referralCode) {
  if (!uid || !referralCode) return;

  try {
    const codeRef = doc(db, "referralCodes", referralCode);
    const codeSnap = await getDoc(codeRef);
    if (codeSnap.exists()) return;

    await setDoc(codeRef, {
      uid,
      username: username || "",
      code: referralCode,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.warn("Could not prepare referral link lookup:", err);
  }
}

function getReferralRewards(count) {
  const perks = [];
  let tier = "Starter";
  if (count >= 3) {
    tier = "Basic";
    perks.push("basic_themes");
  }
  if (count >= 10) {
    tier = "Social";
    perks.push("animated_emoji", "avatar_frame");
  }
  if (count >= 25) {
    tier = "VIP";
    perks.push("vip_badge", "golden_tick");
  }
  if (count >= 50) {
    tier = "Private";
    perks.push("private_theme");
  }
  return { tier, perks };
}

function buildReferralCode(username) {
  return `${String(username || "CHITHI").replace(/_/g, "").toUpperCase()}2k26`.slice(0, 28);
}

function renderReferralPanel(profile) {
  const count = Number(profile.referralCount) || 0;
  const next = REFERRAL_MILESTONES.find((item) => count < item.count);
  const currentTarget = next?.count || 50;
  const previousTarget = REFERRAL_MILESTONES.slice().reverse().find((item) => count >= item.count)?.count || 0;
  const progressRange = Math.max(1, currentTarget - previousTarget);
  const progress = next ? ((count - previousTarget) / progressRange) * 100 : 100;

  if (referralTierEl) referralTierEl.textContent = profile.referralTier || "Starter";
  if (referralCodeEl) referralCodeEl.textContent = profile.referralCode || "CHITHI2k26";
  if (referralLinkEl) referralLinkEl.textContent = getReferralSignupUrl(profile.referralCode || "CHITHI2k26");
  if (referralCountEl) referralCountEl.textContent = `${count} ${count === 1 ? "referral" : "referrals"}`;
  if (referralNextEl) {
    referralNextEl.textContent = next
      ? `${next.count - count} to ${next.label}`
      : "All referral rewards unlocked";
  }
  if (referralProgressFillEl) referralProgressFillEl.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  if (referralTagsEl) {
    referralTagsEl.innerHTML = REFERRAL_MILESTONES.map((item) => {
      const unlocked = count >= item.count;
      return `<span class="referral-tag ${unlocked ? "unlocked" : ""}">${unlocked ? "✓" : "🔒"} ${item.tier} · ${item.label}</span>`;
    }).join("");
  }
  if (referralMilestonesEl) {
    referralMilestonesEl.innerHTML = REFERRAL_MILESTONES.map((item) => `
      <div class="referral-milestone ${count >= item.count ? "unlocked" : ""}">
        <strong>${item.count}+ · ${item.label}</strong>
        <span>${item.detail}</span>
      </div>
    `).join("");
  }
}

function copyReferralLink() {
  if (!currentProfile?.referralCode) return;
  const signupUrl = getReferralSignupUrl(currentProfile.referralCode);
  navigator.clipboard.writeText(signupUrl).then(() => {
    const original = btnCopyReferral.textContent;
    btnCopyReferral.textContent = "Copied";
    setTimeout(() => { btnCopyReferral.textContent = original; }, 1600);
  });
}

function closeQrModal() {
  qrModalEl?.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function getQrDotStyle() {
  const themeKey = document.documentElement.getAttribute("data-theme") || getCachedTheme() || "default";
  switch (themeKey) {
    case "candy_pop":
    case "soft_pastel":
      return "rounded";
    case "dark_mode":
      return "classy";
    case "neon_cyberpunk":
      return "extra-rounded";
    case "private_garden":
      return "classy-rounded";
    default:
      return "rounded";
  }
}

function createInitialImageData(initials, avatarColor) {
  const safeInitials = String(initials || "C").trim().slice(0, 1).toUpperCase();
  const bg = avatarColor || "#2c1e0f";
  // Solid white ring so the avatar reads clearly against the QR dots,
  // then a big solid circle in the user's real avatar color with their initial.
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <circle cx="100" cy="100" r="98" fill="#fffdf7" />
      <circle cx="100" cy="100" r="86" fill="${bg}" />
      <text x="100" y="126" text-anchor="middle" font-size="90" font-family="'Kalam','Patrick Hand',Arial,sans-serif" font-weight="800" fill="#fffdf7">${safeInitials}</text>
    </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

async function renderQrCode(link = activeQrLink) {
  if (!qrPreviewEl || !link) return;
  activeQrLink = link;
  qrPreviewEl.innerHTML = "";

  if (typeof window.QRCodeStyling !== "function") {
    qrPreviewEl.innerHTML = '<p class="field-status err">QR library could not be loaded.</p>';
    return;
  }

  const themeStyles = getComputedStyle(document.documentElement);
  const inkColor = themeStyles.getPropertyValue("--ink").trim() || "#2c1e0f";
  const backgroundColor = themeStyles.getPropertyValue("--paper-card").trim() || "#fffdf7";
  const displayName = currentProfile?.displayName || currentProfile?.username || "Chithi";
  // Live-preview the color the person currently has selected in the profile
  // editor, falling back to their saved avatar color once it's persisted.
  const avatarColor = document.querySelector('input[name="avatar-color"]:checked')?.value
    || currentProfile?.avatarColor
    || "#2c1e0f";
  const primaryColor = avatarColor || "#b5860d";
  const includeAvatar = qrAvatarToggleEl?.checked !== false;
  const avatarImage = includeAvatar ? createInitialImageData(displayName, avatarColor) : "";

  const qrOptions = {
    width: 280,
    height: 280,
    type: "canvas",
    data: link,
    margin: 8,
    qrOptions: {
      typeNumber: 0,
      mode: "Byte",
      errorCorrectionLevel: "H"
    },
    dotsOptions: {
      color: primaryColor,
      type: "rounded"
    },
    cornersSquareOptions: {
      color: inkColor,
      type: "extra-rounded"
    },
    cornersDotOptions: {
      color: primaryColor,
      type: "extra-rounded"
    },
    backgroundOptions: {
      color: backgroundColor
    },
    image: avatarImage,
    imageOptions: avatarImage ? {
      hideBackgroundDots: false,
      imageSize: 0.32,
      margin: 1
    } : {}
  };

  if (qrCodeInstance) {
    qrCodeInstance.update(qrOptions);
    return;
  }

  qrCodeInstance = new window.QRCodeStyling(qrOptions);
  qrCodeInstance.append(qrPreviewEl);
}

async function downloadQrCode() {
  if (!qrCodeInstance) return;
  const username = currentProfile?.username || "chithi";
  qrCodeInstance.download({
    extension: "png",
    name: `${username}-chithi-qr`
  });
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

async function downloadPoster() {
  if (!qrCodeInstance) return;

  const posterWidth = 1080;
  const posterHeight = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = posterWidth;
  canvas.height = posterHeight;
  const ctx = canvas.getContext("2d");
  const themeStyles = getComputedStyle(document.documentElement);
  const primaryColor = themeStyles.getPropertyValue("--gold").trim() || "#b5860d";
  const inkColor = themeStyles.getPropertyValue("--ink").trim() || "#2c1e0f";
  const paperColor = themeStyles.getPropertyValue("--paper").trim() || "#fdf8f0";
  const cardColor = themeStyles.getPropertyValue("--paper-card").trim() || "#fffdf7";
  const username = currentProfile?.displayName || currentProfile?.username || "Chithi";
  const slogan = qrSloganInputEl?.value?.trim() || "Send me your Love ✨";

  const gradient = ctx.createLinearGradient(0, 0, posterWidth, posterHeight);
  gradient.addColorStop(0, cardColor);
  gradient.addColorStop(1, paperColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, posterWidth, posterHeight);

  ctx.fillStyle = `${primaryColor}24`;
  ctx.beginPath();
  ctx.arc(220, 250, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(920, 1640, 260, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = cardColor;
  drawRoundedRect(ctx, 90, 180, 900, 1280, 48);
  ctx.fill();
  ctx.strokeStyle = `${inkColor}26`;
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 90, 180, 900, 1280, 48);
  ctx.stroke();

  ctx.fillStyle = inkColor;
  ctx.font = "bold 92px 'Caveat', cursive";
  ctx.fillText("Chithi", 140, 300);
  ctx.font = "500 44px 'Kalam', cursive";
  ctx.fillText("Your personal letter link", 140, 400);

  ctx.fillStyle = primaryColor;
  ctx.font = "600 56px 'Caveat', cursive";
  ctx.fillText(slogan, 140, 500);

  ctx.fillStyle = inkColor;
  ctx.font = "600 48px 'Kalam', cursive";
  ctx.fillText(`@${username}`, 140, 620);

  const rawData = await qrCodeInstance.getRawData("png");
  const qrBlob = rawData instanceof Blob ? rawData : new Blob([rawData], { type: "image/png" });
  const qrUrl = URL.createObjectURL(qrBlob);
  const qrImage = new Image();
  qrImage.src = qrUrl;
  await new Promise((resolve, reject) => {
    qrImage.onload = resolve;
    qrImage.onerror = reject;
  });

  ctx.drawImage(qrImage, 300, 770, 480, 480);
  ctx.fillStyle = inkColor;
  ctx.font = "600 36px 'Lora', serif";
  ctx.fillText("Scan to send a letter", 360, 1320);
  ctx.textBaseline = "middle";

  ctx.font = "600 40px 'Caveat', cursive";
  ctx.fillText("💌", 140, 1502);

  ctx.font = "500 34px 'Lora', serif";
  ctx.fillText("chithi.app", 190, 1500);

  const link = canvas.toDataURL("image/png");
  const anchor = document.createElement("a");
  anchor.href = link;
  anchor.download = `${username || "chithi"}-poster.png`;
  anchor.click();
  URL.revokeObjectURL(qrUrl);
}

function getReferralSignupUrl(referralCode) {
  return window.ChithiUrl?.page
    ? `${window.ChithiUrl.page("signup")}?ref=${referralCode}`
    : `${window.location.origin}/signup.html?ref=${referralCode}`;
}

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
        ${msg.keystrokeLog && msg.keystrokeLog.length > 1 ? `<button class="btn-card-action btn-playback" data-id="${docSnap.id}" title="Watch how this letter was typed">▶ Playback</button>` : ""}
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

  card.querySelector(".btn-playback")?.addEventListener("click", () => {
    openPlaybackModal(msg);
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
function isEmojiCustomizeUnlocked(profile) {
  const perks = (profile || currentProfile || {}).unlockedPerks || [];
  return perks.includes("animated_emoji");
}

function hydrateProfileForm(profile) {
  if (profileNameEl) profileNameEl.value = profile.displayName || profile.username || "";
  if (profileBioEl) profileBioEl.value = profile.bio || "";
  const emojiUnlocked = isEmojiCustomizeUnlocked(profile);
  const customEmojis = emojiUnlocked ? normalizeEmojiList(profile.customEmojis) : [];
  if (profileEmojisEl) {
    profileEmojisEl.value = customEmojis.join(" ");
    profileEmojisEl.disabled = !emojiUnlocked;
    profileEmojisEl.placeholder = emojiUnlocked ? "💌 ✨ 💕 🎈 🌸" : "🔒 Unlocks at 10 referrals";
  }
  updateFloatingEmojis(customEmojis);
  if (emojiStatusEl) {
    if (emojiUnlocked) {
      emojiStatusEl.textContent = "Use up to 12 emojis, separated by spaces.";
      emojiStatusEl.className = "field-status";
    } else {
      const remaining = Math.max(0, 10 - (Number(profile.referralCount) || 0));
      emojiStatusEl.textContent = `🔒 Invite ${remaining} more friend${remaining === 1 ? "" : "s"} to unlock custom floating emojis.`;
      emojiStatusEl.className = "field-status locked";
    }
  }
  const color = profile.avatarColor || "#2c1e0f";
  const colorOption = document.querySelector(`input[name="avatar-color"][value="${color}"]`);
  if (colorOption) colorOption.checked = true;
  const display = profile.displayName || profile.username || "?";
  updateProfileAvatarPreview(color, display);
  if (profilePreviewNameEl) profilePreviewNameEl.textContent = profile.displayName || profile.username || "Your profile";
  if (profilePreviewBioEl) profilePreviewBioEl.textContent = profile.bio || "No bio added yet.";
  renderThemePicker(profile);
  renderProfilePerks(profile);
  renderQrCode(activeQrLink || userLinkEl?.textContent || "");
}

function parseCustomEmojis(value) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue) return [];

  if (window.Intl?.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...segmenter.segment(cleanValue)]
      .map(part => part.segment.trim())
      .filter(Boolean)
      .filter(part => !/^[,.;:|/\\]+$/.test(part))
      .slice(0, 12);
  }

  return Array.from(cleanValue)
    .map(part => part.trim())
    .filter(Boolean)
    .filter(part => !/^[,.;:|/\\]+$/.test(part))
    .slice(0, 12);
}

function normalizeEmojiList(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item || "").trim()).filter(Boolean).slice(0, 12);
  }
  return parseCustomEmojis(value);
}

function updateFloatingEmojis(customEmojis) {
  const emojis = normalizeEmojiList(customEmojis);
  window.ChithiSetFloatingEmojis?.(emojis.length ? emojis : DEFAULT_FLOATING_EMOJIS);
}

function setEmojiStatus(message, isError) {
  if (!emojiStatusEl) return;
  emojiStatusEl.textContent = message;
  emojiStatusEl.className = `field-status ${isError ? "err" : "ok"}`;
}

function updateProfileAvatarPreview(color, displayName) {
  const display = displayName || profileNameEl?.value.trim() || currentProfile?.displayName || currentProfile?.username || "?";
  [profileAvatarEl, profileEditAvatarEl].forEach((avatarEl) => {
    if (!avatarEl) return;
    avatarEl.textContent = display.charAt(0).toUpperCase();
    avatarEl.style.background = color || "#2c1e0f";
  });
  renderProfilePerks(currentProfile || {});
}

function renderThemePicker(profile) {
  if (!themeChoiceGridEl) return;
  const unlockedThemes = profile.unlockedThemes || currentUnlockedThemes || ["default"];
  const activeTheme = isThemeUnlocked(profile.theme || "default", unlockedThemes) ? (profile.theme || "default") : "default";

  themeChoiceGridEl.innerHTML = Object.entries(THEMES).map(([themeKey, theme]) => {
    const unlocked = isThemeUnlocked(themeKey, unlockedThemes);
    const needed = THEME_UNLOCK_LEVELS[themeKey] || 0;
    return `
      <label class="theme-choice ${unlocked ? "" : "locked"}" title="${unlocked ? theme.label : `${needed} referrals needed`}">
        <input type="radio" name="profile-theme" value="${themeKey}" ${activeTheme === themeKey ? "checked" : ""} ${unlocked ? "" : "disabled"} />
        <span class="theme-swatch">${theme.swatch.map(color => `<span style="background:${color}"></span>`).join("")}</span>
        <span>
          <span class="theme-choice-name">${theme.label}</span>
          <span class="theme-choice-note">${unlocked ? "Unlocked" : `${needed} referrals`}</span>
        </span>
      </label>
    `;
  }).join("");

  themeChoiceGridEl.querySelectorAll('input[name="profile-theme"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.disabled) {
        const isGarden = input.value === CUSTOMIZABLE_THEME;
        applyTheme(input.value, isGarden ? currentGardenColors : undefined);
        renderQrCode(activeQrLink || userLinkEl?.textContent || "");
        if (themeStatusEl) {
          themeStatusEl.textContent = `${THEMES[input.value]?.label || "Theme"} preview selected. Save to keep it.`;
          themeStatusEl.className = "field-status ok";
        }
        updateGardenPickerVisibility(isGarden);
      }
    });
  });

  updateGardenPickerVisibility(activeTheme === CUSTOMIZABLE_THEME && isThemeUnlocked(CUSTOMIZABLE_THEME, unlockedThemes));
}

/** Show/hide the 3-color picker and prefill it with saved or preset colors. */
function updateGardenPickerVisibility(show) {
  if (!gardenColorPickerEl) return;
  gardenColorPickerEl.classList.toggle("hidden", !show);
  if (!show) return;

  const preset = THEMES.private_garden.vars;
  const colors = currentGardenColors || {
    bg: preset["--paper"],
    ink: preset["--ink"],
    accent: preset["--gold"]
  };
  if (gardenBgInputEl)     gardenBgInputEl.value = colors.bg;
  if (gardenInkInputEl)    gardenInkInputEl.value = colors.ink;
  if (gardenAccentInputEl) gardenAccentInputEl.value = colors.accent;
}

function readGardenColorsFromInputs() {
  return {
    bg: gardenBgInputEl?.value,
    ink: gardenInkInputEl?.value,
    accent: gardenAccentInputEl?.value
  };
}

[gardenBgInputEl, gardenInkInputEl, gardenAccentInputEl].forEach((input) => {
  input?.addEventListener("input", () => {
    currentGardenColors = readGardenColorsFromInputs();
    applyTheme(CUSTOMIZABLE_THEME, currentGardenColors);
    if (themeStatusEl) {
      themeStatusEl.textContent = "Private Garden colors previewed. Save to keep it.";
      themeStatusEl.className = "field-status ok";
    }
  });
});

function renderProfilePerks(profile) {
  const perks = profile.unlockedPerks || [];
  const hasFrame = perks.includes("avatar_frame");
  const hasAnimatedEmoji = perks.includes("animated_emoji");
  const hasVip = perks.includes("golden_tick") || perks.includes("vip_badge");
  [profileAvatarEl, profileEditAvatarEl].forEach((avatarEl) => {
    avatarEl?.classList.toggle("avatar-framed", hasFrame);
  });

  profileRewardEmojiEl?.classList.toggle("hidden", !hasAnimatedEmoji || hasVip);
  profileVipTickEl?.classList.toggle("hidden", !hasVip);
}

async function saveProfile() {
  if (!currentUser || !currentProfile) return;
  const displayName = profileNameEl.value.trim() || currentProfile.username;
  const bio = profileBioEl.value.trim();
  const customEmojis = isEmojiCustomizeUnlocked(currentProfile)
    ? parseCustomEmojis(profileEmojisEl?.value || "")
    : [];
  const avatarColor = document.querySelector('input[name="avatar-color"]:checked')?.value || "#2c1e0f";
  const selectedTheme = document.querySelector('input[name="profile-theme"]:checked')?.value || "default";

  if (displayName.length > 40) return setProfileStatus("Display name is too long.", true);
  if (bio.length > 90) return setProfileStatus("Bio is too long.", true);
  if (!isThemeUnlocked(selectedTheme, currentUnlockedThemes)) {
    return setProfileStatus("That theme is still locked.", true);
  }

  const isGardenSelected = selectedTheme === CUSTOMIZABLE_THEME;
  const privateGardenColors = isGardenSelected
    ? readGardenColorsFromInputs()
    : (currentGardenColors || null);

  try {
    const updatePayload = { displayName, bio, customEmojis, avatarColor, theme: selectedTheme };
    if (privateGardenColors) updatePayload.privateGardenColors = privateGardenColors;

    await updateDoc(doc(db, "users", currentUser.uid), updatePayload);
    currentProfile = { ...currentProfile, displayName, bio, customEmojis, avatarColor, theme: selectedTheme, privateGardenColors };
    currentGardenColors = privateGardenColors;
    cacheThemeLocally(selectedTheme);
    if (isGardenSelected && privateGardenColors) cacheGardenColorsLocally(privateGardenColors);
    applyTheme(selectedTheme, isGardenSelected ? privateGardenColors : undefined);
    updateFloatingEmojis(customEmojis);
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
    if (currentProfile.referralCode) deleteRefs.push(doc(db, "referralCodes", currentProfile.referralCode));

    const madeByMeSnap = await getDocs(query(
      collection(db, "referrals"),
      where("referredUid", "==", currentUser.uid)
    ));
    const sentToMeSnap = await getDocs(query(
      collection(db, "referrals"),
      where("referrerUid", "==", currentUser.uid)
    ));
    madeByMeSnap.docs.forEach(referralDoc => deleteRefs.push(doc(db, "referrals", referralDoc.id)));
    sentToMeSnap.docs.forEach(referralDoc => deleteRefs.push(doc(db, "referrals", referralDoc.id)));

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

// ─── Playback Modal ───────────────────────────────────────────
let playbackRAF    = null;
let playbackActive = false;

function openPlaybackModal(msg) {
  const log = msg.keystrokeLog;
  if (!log || log.length < 2) return;

  let modal = document.getElementById("playback-modal");
  if (!modal) {
    modal = createPlaybackModalDOM();
    document.body.appendChild(modal);
  }

  const display   = modal.querySelector("#pb-display");
  const cursor    = modal.querySelector("#pb-cursor");
  const progress  = modal.querySelector("#pb-progress");
  const frameInfo = modal.querySelector("#pb-frame-info");
  const btnPlay   = modal.querySelector("#pb-btn-play");
  const btnRestart= modal.querySelector("#pb-btn-restart");
  const speedSel  = modal.querySelector("#pb-speed");
  const fontKey   = msg.fontKey || "hand-caveat";
  const bgKey     = msg.bgKey   || "paper";

  // Apply sender's font to display area
  display.className = `pb-display-text font-${
    allowedFontKeys.has(fontKey) ? fontKey : "hand-caveat"
  }`;

  // Apply sender's bg to paper area
  const paper = modal.querySelector(".pb-paper");
  paper.classList.remove("letter-bg-paper","letter-bg-rose","letter-bg-mint","letter-bg-sky");
  paper.classList.add(allowedBgKeys.has(bgKey) ? `letter-bg-${bgKey}` : "letter-bg-paper");
  display.textContent = "";
  progress.style.width = "0%";
  frameInfo.textContent = `0 / ${log.length} events`;
  btnPlay.textContent = "▶ Play";
  playbackActive = false;
  if (playbackRAF) cancelAnimationFrame(playbackRAF);

  let currentFrame  = 0;
  let startWallTime = null;
  let startLogTime  = 0;
  let paused        = true;

  function renderFrame(idx) {
    display.textContent = log[idx].v;
    const pct = ((idx + 1) / log.length) * 100;
    progress.style.width = `${pct}%`;
    frameInfo.textContent = `${idx + 1} / ${log.length} events`;
    cursor.style.animationDuration = idx < log.length - 1 ? "0.5s" : "1.1s";
  }

  function playLoop(now) {
    if (paused) return;
    if (startWallTime === null) {
      startWallTime = now;
      startLogTime  = log[currentFrame].t;
    }
    const speed   = parseFloat(speedSel.value) || 1;
    const elapsed = (now - startWallTime) * speed;
    while (currentFrame < log.length && log[currentFrame].t - startLogTime <= elapsed) {
      renderFrame(currentFrame);
      currentFrame++;
    }
    if (currentFrame >= log.length) {
      paused = true;
      playbackActive = false;
      btnPlay.textContent = "▶ Play";
      return;
    }
    playbackRAF = requestAnimationFrame(playLoop);
  }

  function startPlay() {
    if (currentFrame >= log.length) { currentFrame = 0; startWallTime = null; }
    paused = false;
    playbackActive = true;
    btnPlay.textContent = "⏸ Pause";
    playbackRAF = requestAnimationFrame(playLoop);
  }

  function pausePlay() {
    paused = true;
    playbackActive = false;
    btnPlay.textContent = "▶ Play";
    if (playbackRAF) cancelAnimationFrame(playbackRAF);
  }

  btnPlay.onclick    = () => paused ? startPlay() : pausePlay();
  btnRestart.onclick = () => {
    if (playbackRAF) cancelAnimationFrame(playbackRAF);
    currentFrame = 0; startWallTime = null; paused = false; playbackActive = true;
    display.textContent = ""; progress.style.width = "0%";
    btnPlay.textContent = "⏸ Pause";
    playbackRAF = requestAnimationFrame(playLoop);
  };

  modal.classList.add("pb-open");
  document.body.style.overflow = "hidden";
  setTimeout(startPlay, 350);
}

function createPlaybackModalDOM() {
  const modal = document.createElement("div");
  modal.id = "playback-modal";
  modal.className = "pb-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Letter playback");
  modal.innerHTML = `
    <div class="pb-backdrop"></div>
    <div class="pb-sheet">
      <div class="pb-header">
        <span class="pb-title">✍️ Typing Playback</span>
        <button class="pb-close" id="pb-close" aria-label="Close">✕</button>
      </div>
      <div class="pb-paper">
        <div class="pb-lines"></div>
        <div class="pb-text-wrap">
          <span id="pb-display" class="pb-display-text font-hand-caveat"></span><span id="pb-cursor" class="pb-cursor">|</span>
        </div>
      </div>
      <div class="pb-progress-track">
        <div id="pb-progress" class="pb-progress-fill"></div>
      </div>
      <div class="pb-controls">
        <div class="pb-controls-left">
          <button id="pb-btn-play" class="pb-btn pb-btn-primary">▶ Play</button>
          <button id="pb-btn-restart" class="pb-btn pb-btn-ghost">↩ Restart</button>
        </div>
        <div class="pb-controls-right">
          <label class="pb-speed-label">Speed
            <select id="pb-speed" class="pb-speed-select">
              <option value="0.5">0.5×</option>
              <option value="1" selected>1×</option>
              <option value="2">2×</option>
              <option value="4">4×</option>
              <option value="8">8×</option>
            </select>
          </label>
          <span id="pb-frame-info" class="pb-frame-info">0 / 0 events</span>
        </div>
      </div>
    </div>
  `;
  modal.querySelector(".pb-backdrop").onclick = closePlaybackModal;
  modal.querySelector("#pb-close").onclick     = closePlaybackModal;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("pb-open")) closePlaybackModal();
  });
  return modal;
}

function closePlaybackModal() {
  const modal = document.getElementById("playback-modal");
  if (!modal) return;
  if (playbackRAF) cancelAnimationFrame(playbackRAF);
  playbackActive = false;
  modal.classList.remove("pb-open");
  document.body.style.overflow = "";
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
