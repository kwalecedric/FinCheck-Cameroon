import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCdU-t2ItIjVFRQo65rzle8n2PrKZ_STmU",
  authDomain: "cameroon-fintech-status.firebaseapp.com",
  databaseURL: "https://cameroon-fintech-status-default-rtdb.firebaseio.com",
  projectId: "cameroon-fintech-status",
  storageBucket: "cameroon-fintech-status.firebasestorage.app",
  messagingSenderId: "842559320219",
  appId: "1:842559320219:web:6011def2b8d8031b6bd63e"
};

const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const provider = new GoogleAuthProvider();

// If already logged in, go straight to dashboard
onAuthStateChanged(auth, user => {
  if (user) window.location.href = "dashboard.html";
});

// Switch between login and register tabs
window.switchTab = function(tab) {
  document.getElementById("tab-login").style.display    = tab === "login"    ? "block" : "none";
  document.getElementById("tab-register").style.display = tab === "register" ? "block" : "none";
  document.querySelectorAll(".auth-tab").forEach((b,i) => {
    b.classList.toggle("active", (i === 0 && tab === "login") || (i === 1 && tab === "register"));
  });
};

// Email login
window.emailLogin = async function() {
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl    = document.getElementById("login-error");
  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "dashboard.html";
  } catch(e) {
    errEl.textContent = friendlyError(e.code);
  }
};

// Email register
window.emailRegister = async function() {
  const name     = document.getElementById("reg-name").value.trim();
  const email    = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const errEl    = document.getElementById("reg-error");
  if (!name) { errEl.textContent = "Please enter your name."; return; }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    window.location.href = "dashboard.html";
  } catch(e) {
    errEl.textContent = friendlyError(e.code);
  }
};

// Google login
window.googleLogin = async function() {
  try {
    await signInWithPopup(auth, provider);
    window.location.href = "dashboard.html";
  } catch(e) {
    document.getElementById("login-error").textContent = friendlyError(e.code);
  }
};

function friendlyError(code) {
  if (code === "auth/user-not-found")    return "No account found with that email.";
  if (code === "auth/wrong-password")    return "Incorrect password.";
  if (code === "auth/email-already-in-use") return "An account with this email already exists.";
  if (code === "auth/weak-password")     return "Password must be at least 6 characters.";
  if (code === "auth/invalid-email")     return "Please enter a valid email address.";
  return "Something went wrong. Please try again.";
}