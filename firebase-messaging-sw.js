// ============================================================
//  firebase-messaging-sw.js
//  FCM Service Worker — handles BACKGROUND push notifications.
//  Must live at the ROOT of your site (same level as index.html).
// ============================================================

// ⬇️  Keep these versions in sync with firebase-config.js  ⬇️
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey:            "AIzaSyBF63S5fAdoRLy6uZjwtMWaKs9T-4RiVwE",
  authDomain:        "chithi-8b644.firebaseapp.com",
  projectId:         "chithi-8b644",
  storageBucket:     "chithi-8b644.firebasestorage.app",
  messagingSenderId: "345023225806",
  appId:             "1:345023225806:web:bee328edf75e784f0f959f"
});

const messaging = firebase.messaging();

// ── Background message handler ────────────────────────────────
// Fires when a push arrives while the tab is hidden / closed.
// FCM auto-displays the notification using the `notification`
// payload; this handler lets you customise it if needed.
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || "💌 New letter!", {
    body:  body  || "You received a new letter on Chithi.",
    icon:  icon  || "/favicon.ico",
    badge: "/favicon.ico",
    tag:   "chithi-letter",          // collapses duplicates
    renotify: true,
    data: { url: payload.data?.url || "/dashboard.html" }
  });
});

// ── Notification click → open / focus the dashboard ──────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/dashboard.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      return clients.openWindow(target);
    })
  );
});
