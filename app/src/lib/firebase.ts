import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAI, GoogleAIBackend, type AI } from "firebase/ai";
import { getAuth, signInAnonymously, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// Firebase web config values are public client identifiers (they ship in
// every web build). They are supplied via .env.local locally and via the
// hosting environment for the deployed demo. Never put service-account
// keys, App Check debug tokens, or any secret in this file or the repo.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

let app: FirebaseApp | null = null;
let aiBackend: AI | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

export function getFirebase() {
  if (!firebaseConfigured) return null;
  if (!app) {
    app = initializeApp(firebaseConfig);

    // App Check is required by Firebase AI Logic. Locally, the debug
    // provider is used (token registered in the Firebase console, never
    // committed). In production, reCAPTCHA Enterprise is used when a site
    // key is provided via env.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
    if (siteKey) {
      try {
        initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(siteKey),
          isTokenAutoRefreshEnabled: true,
        });
      } catch {
        // App Check may already be initialized (HMR) — safe to ignore.
      }
    }
    // With no site key (local dev), the debug token set above is registered
    // in the Firebase console under App Check > Apps > Manage debug tokens.
    // Debug tokens are accepted for hackathon submissions and are never
    // committed to this repo.
  }
  return app;
}

export function getAiBackend(): AI | null {
  const fbApp = getFirebase();
  if (!fbApp) return null;
  if (!aiBackend) {
    aiBackend = getAI(fbApp, { backend: new GoogleAIBackend() });
  }
  return aiBackend;
}

export function getAuthInstance(): Auth | null {
  const fbApp = getFirebase();
  if (!fbApp) return null;
  if (!authInstance) authInstance = getAuth(fbApp);
  return authInstance;
}

export async function ensureAnonymousUser(): Promise<string | null> {
  const auth = getAuthInstance();
  if (!auth) return null;
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

export function getDb(): Firestore | null {
  const fbApp = getFirebase();
  if (!fbApp) return null;
  if (!dbInstance) dbInstance = getFirestore(fbApp);
  return dbInstance;
}
