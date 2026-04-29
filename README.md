# Chithi — Anonymous Messaging App

A clean, anonymous messaging web app built with vanilla HTML/CSS/JS + Firebase.
Users get a personal link. Anyone can send them letters — anonymously or not.

---

## 🚀 Quick Start

### 1. Create a Firebase Project

1. Go to **https://console.firebase.google.com**
2. Click **"Add project"**
3. Name it (e.g. `chithi-app`), click through the setup
4. Once created, you're on the project dashboard

---

### 2. Enable Firebase Authentication

1. In your Firebase project, go to **Build → Authentication**
2. Click **"Get started"**
3. Under **Sign-in method**, click **Email/Password**
4. Toggle **Enable** → Save

---

### 3. Set Up Firestore Database

1. Go to **Build → Firestore Database**
2. Click **"Create database"**
3. Choose **"Start in production mode"** → Next
4. Pick a region close to your users → Enable
5. Wait a few seconds for it to initialize

---

### 4. Set Up Firestore Security Rules

1. In Firestore, click the **"Rules"** tab
2. **Replace all** the existing rules with the contents of `firestore.rules`
3. Click **"Publish"**

---

### 5. Enable Firestore TTL (Auto-delete after 30 days)

1. In Firestore, go to the **"Indexes"** tab
2. Click **"TTL policies"** (or find it in the left menu under Firestore)
3. Click **"Add TTL policy"**
4. Set:
   - **Collection group**: `messages`
   - **Timestamp field**: `expireAt`
5. Click **"Create"**

> ⚠️ TTL deletion can take up to 72 hours after the `expireAt` time.

---

### 6. Get Your Firebase Config

1. In Firebase Console, click the **gear icon ⚙️** → **Project settings**
2. Scroll down to **"Your apps"**
3. If you haven't added a web app yet:
   - Click the **`</>`** (Web) icon
   - Register app name → **Register app**
4. You'll see a code block like this:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-app",
  storageBucket: "your-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

5. Open **`firebase-config.js`** in this project
6. **Replace the placeholder config** with your actual values

---

### 7. Deploy to GitHub Pages

#### Option A — GitHub Pages (Recommended)

1. Create a new repository on GitHub (e.g. `chithi`)
2. Push all project files to it:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/chithi.git
git push -u origin main
```

3. Go to your repo → **Settings → Pages**
4. Under **Source**, select `main` branch and `/ (root)` folder
5. Click **Save**
6. Your site will be live at: `https://YOUR_USERNAME.github.io/chithi/`

#### Option B — Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Select your project, set public dir to "." (current folder)
firebase deploy
```

---

### 8. Update URLs (Important!)

Once deployed, update the base URL in a few places:

**In `sendMessage.js`** — the delete link and public link already use
`window.location.origin` dynamically, so no changes needed there.

**In `inbox.js`** — same, it's dynamic. ✅

> The app builds URLs dynamically using `window.location.origin`, so it should
> work on any domain without code changes.

---

## 📁 Project Structure

```
chithi/
├── index.html          → Landing page
├── signup.html         → Sign up (2 steps: account + username)
├── login.html          → Sign in
├── dashboard.html      → Inbox (protected, logged-in only)
├── user.html           → Public message page (?u=username)
├── delete.html         → Token-based message deletion
├── styles.css         → All styles
├── firebase-config.js → Firebase init (EDIT THIS)
├── auth.js            → Login/signup logic
├── sendMessage.js     → Send message logic
├── inbox.js           → Dashboard/inbox logic
├── delete.js          → Delete by token logic
└── firestore.rules     → Security rules (paste in Firebase Console)
```

---

## 🔐 Security Notes

- **Firestore Rules** ensure only the recipient can read/delete their messages
- **Token-based delete**: The sender gets a random 32-char hex token. Messages
  are stored under that token as the document ID, so the unsend page can fetch
  and delete that exact message without a collection query.
- **Username squatting protection**: Usernames are reserved in a `usernames`
  collection immediately upon signup
- **XSS protection**: All user content is escaped via `escapeHtml()` before
  rendering into the DOM

> Anyone who knows the delete token can unsend that specific message. Keep the
> link private if you want that control to remain with the sender only.

---

## 💡 How Sender Delete Works

When a message is sent:
1. A random 32-char token is generated in the browser
2. The token is stored in Firestore alongside the message
3. The sender sees a delete link: `yoursite.com/delete.html?token=TOKEN`
4. On `delete.html`, Firestore reads the exact `messages/TOKEN` document
5. If found, the sender can confirm deletion

---

## 🗑️ Auto-Delete (30 days)

Messages include an `expireAt` field set to `createdAt + 30 days`.
Firebase's TTL (Time-To-Live) policy automatically deletes these documents.
Make sure to set this up in Step 5 above.

---

## 📱 Features

- ✅ Email/password signup & login
- ✅ Unique username selection with real-time availability check
- ✅ Personal public link (`/user.html?u=USERNAME`)
- ✅ Anonymous or named message sending
- ✅ Real-time inbox with Firestore live updates
- ✅ Delete messages (receiver) or unsend (sender via token)
- ✅ 30-day auto-expiry via Firestore TTL
- ✅ Mobile-friendly, paper/letter aesthetic
- ✅ Character counter (max 1000)
- ✅ Copy-to-clipboard for links
- ✅ XSS-safe message rendering

---

## 🤔 Troubleshooting

**"Firebase: Error (auth/configuration-not-found)"**  
→ Your `firebase-config.js` still has placeholder values. Replace with your actual config.

**Messages not loading on dashboard**  
→ Check Firestore Rules are published. Check browser console for errors.

**"Permission denied" errors**  
→ Your Firestore rules may be incorrect. Re-paste from `firestore.rules` and publish.

**Username check not working**  
→ Make sure Firestore is initialized and the `usernames` collection exists (it's created on first signup).

**Delete page says "Message not found"**  
→ Message may have already been deleted, or the token in the URL is incorrect/expired.
