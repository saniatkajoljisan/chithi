// ============================================================
//  js/firebase-config.js
//  Firebase initialization — paste your project config here
// ============================================================

// STEP 1: Go to https://console.firebase.google.com
// STEP 2: Create a new project (or open an existing one)
// STEP 3: Click the </> (Web) icon to register a web app
// STEP 4: Copy the firebaseConfig object shown and paste it below
// STEP 5: Replace every value in the object with YOUR project values

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ⬇️  REPLACE THIS ENTIRE OBJECT WITH YOUR OWN CONFIG  ⬇️
const firebaseConfig = {
  apiKey:           "AIzaSyBF63S5fAdoRLy6uZjwtMWaKs9T-4RiVwE",
  authDomain:        "chithi-8b644.firebaseapp.com",
  projectId:        "chithi-8b644",
  storageBucket:     "chithi-8b644.firebasestorage.app",
  messagingSenderId:  "345023225806",
  appId:             "1:345023225806:web:bee328edf75e784f0f959f"
};
// ⬆️  REPLACE THIS ENTIRE OBJECT WITH YOUR OWN CONFIG  ⬆️

// Initialize Firebase
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// Export so other scripts can import them
export { auth, db };