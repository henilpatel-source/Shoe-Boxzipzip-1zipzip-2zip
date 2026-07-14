// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAeBdqEblXIxnGZzk7i0wHhqwgSX1ABJ7I",
  authDomain: "shoe-box-3a237.firebaseapp.com",
  databaseURL: "https://shoe-box-3a237-default-rtdb.firebaseio.com",
  projectId: "shoe-box-3a237",
  storageBucket: "shoe-box-3a237.firebasestorage.app",
  messagingSenderId: "479231208368",
  appId: "1:479231208368:web:59c7ab4fdb2e59c5990475",
  measurementId: "G-794PS13DYF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

console.log("Firebase connected successfully");
