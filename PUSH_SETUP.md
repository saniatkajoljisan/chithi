# Chithi — FCM Push Notifications Setup

## Files changed / added

| File | Status | What changed |
|------|--------|--------------|
| `firebase-messaging-sw.js` | **NEW** | Service Worker for background push handling |
| `inbox.js` | **UPDATED** | FCM token registration + foreground notification trigger |
| `dashboard.html` | **UNCHANGED** | No changes needed |

---

## One-time setup steps

### 1. Get your VAPID key (required)

1. Open [Firebase Console](https://console.firebase.google.com) → your project
2. Go to **Project Settings** (gear icon) → **Cloud Messaging** tab
3. Scroll to **"Web Push certificates"**
4. Click **"Generate key pair"** (or copy an existing one)
5. Open `inbox.js` and replace line:
   ```js
   const VAPID_KEY = "YOUR_VAPID_KEY_HERE";
   ```
   with your actual key.

### 2. Place the Service Worker at your site root

`firebase-messaging-sw.js` **must** be served from the root path `/firebase-messaging-sw.js`
(same level as `index.html`, `dashboard.html`, etc.).

The file already contains your Firebase config — no changes needed there.

### 3. Enable Cloud Messaging in Firebase Console

In Firebase Console → **Cloud Messaging** → make sure the API is enabled for your project.

---

## How it works

```
User opens dashboard.html
        │
        ▼
initPushNotifications() runs
        │
        ├─ Notification.requestPermission()   ← browser shows permission prompt
        │
        ├─ Registers /firebase-messaging-sw.js
        │
        ├─ getToken(messaging, { vapidKey })   ← gets browser-specific FCM token
        │
        └─ Saves token to Firestore:
           users/{uid}.fcmTokens = [ ...existing, newToken ]

When a new letter arrives (onSnapshot "added"):
        │
        ├─ Tab is VISIBLE  →  showForegroundNotification()
        │                     (Notification API, no SW needed)
        │
        └─ Tab is HIDDEN   →  FCM push → Service Worker
                              → onBackgroundMessage() shows system notification
                              → clicking notification opens/focuses dashboard
```

## Firestore token storage

Tokens are stored as an array so the same user on multiple browsers/devices
all receive notifications:

```
users/{uid}: {
  ...existing fields...
  fcmTokens: ["token_chrome", "token_firefox", "token_mobile", ...]
}
```

To send a server-side push to a user, retrieve their `fcmTokens` array and
send to each token via the Firebase Admin SDK or REST API.

---

## Notes

- **iOS Safari**: Push notifications require iOS 16.4+ with the site installed
  as a PWA (Add to Home Screen). Plain Safari tabs do not support Web Push.
- **Firefox private mode**: `getToken()` may fail silently — handled gracefully.
- **Token refresh**: FCM tokens can expire. For production, also handle
  `onTokenRefresh` or re-fetch on each login.
- The first `onSnapshot` never fires notifications (seeds `seenMessageIds`),
  so existing letters on page load don't trigger alerts.
