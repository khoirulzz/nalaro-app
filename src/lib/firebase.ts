import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const configured = (value: string | undefined, fallback: string) =>
  value?.trim() || fallback;

// Firebase web config is a public client identifier, not a server secret.
// Environment variables can override these defaults per deployment.
const firebaseConfig = {
  apiKey: configured(import.meta.env.PUBLIC_FIREBASE_API_KEY, "AIzaSyDw2IvOR9WamB73E1GVUoe9j3tWot0V300"),
  authDomain: configured(import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN, "nalaro.firebaseapp.com"),
  projectId: configured(import.meta.env.PUBLIC_FIREBASE_PROJECT_ID, "nalaro"),
  storageBucket: configured(import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET, "nalaro.firebasestorage.app"),
  messagingSenderId: configured(import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID, "136947037780"),
  appId: configured(import.meta.env.PUBLIC_FIREBASE_APP_ID, "1:136947037780:web:0922bd768a9329ef5d1fc1"),
  measurementId: configured(import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID, "G-CGL1XSHG4C"),
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const db = getFirestore(app);
