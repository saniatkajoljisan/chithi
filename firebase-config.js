// ============================================================
//  js/firebase-config.js
//  Firebase initialization — paste your project config here
// ============================================================

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getMessaging, getToken, onMessage }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";

const firebaseConfig = {
  apiKey:           "AIzaSyBF63S5fAdoRLy6uZjwtMWaKs9T-4RiVwE",
  authDomain:        "chithi-8b644.firebaseapp.com",
  projectId:        "chithi-8b644",
  storageBucket:     "chithi-8b644.firebasestorage.app",
  messagingSenderId:  "345023225806",
  appId:             "1:345023225806:web:bee328edf75e784f0f959f"
};

// Initialize Firebase
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// Initialize Messaging (only in supported browsers)
let messaging = null;
try {
  messaging = getMessaging(app);
} catch (_) {
  // Messaging not supported (e.g. Firefox private mode, some mobile browsers)
}

const VAPID_KEY = "BJwqjcLv2aWShpsxvKSia_8vxOcNhe8cEHxwoqstZ8cxiw8eAgirrV5XSrM3AaMt3cy2HZkvm_4lh0-qwJzKioA";

export { auth, db, messaging, getToken, onMessage, VAPID_KEY };
