// ============================================================
//  firebase-messaging-sw.js
//  Service Worker for Firebase Cloud Messaging (FCM)
//  Place this file in the ROOT of your project
// ============================================================

importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey:           "AIzaSyBF63S5fAdoRLy6uZjwtMWaKs9T-4RiVwE",
  authDomain:        "chithi-8b644.firebaseapp.com",
  projectId:        "chithi-8b644",
  storageBucket:     "chithi-8b644.firebasestorage.app",
  messagingSenderId:  "345023225806",
  appId:             "1:345023225806:web:bee328edf75e784f0f959f"
});

const messaging = firebase.messaging();

// Handle background messages (when tab is not in focus)
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "💌 New Letter — Chithi";
  const body  = payload.notification?.body  || "You received a new letter!";

  self.registration.showNotification(title, {
    body,
    icon:  "/favicon.ico",
    badge: "/favicon.ico",
    tag:   "chithi-new-letter",
    data:  { url: payload.data?.url || "/dashboard.html" }
  });
});

// Click on notification → open dashboard
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/dashboard.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes("dashboard") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
