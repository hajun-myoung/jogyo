import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

export type FirebaseServices =
  | {
      status: "enabled";
      app: FirebaseApp;
      auth: Auth;
      db: Firestore;
      provider: GoogleAuthProvider;
    }
  | {
      status: "disabled";
      missingKeys: string[];
    };

const FIREBASE_ENV_KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

function readFirebaseConfig() {
  const envValues = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  console.log(envValues);
  const missingKeys = FIREBASE_ENV_KEYS.filter((key) => !process.env[key]);

  if (missingKeys.length > 0) {
    return {
      status: "disabled" as const,
      missingKeys,
    };
  }

  return {
    status: "enabled" as const,
    config: envValues as {
      apiKey: string;
      authDomain: string;
      projectId: string;
      storageBucket: string;
      messagingSenderId: string;
      appId: string;
    },
  };
}

export function getFirebaseServices(): FirebaseServices {
  const firebaseConfig = readFirebaseConfig();

  if (firebaseConfig.status === "disabled") {
    return firebaseConfig;
  }

  const app =
    getApps().length > 0 ? getApp() : initializeApp(firebaseConfig.config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const provider = new GoogleAuthProvider();

  provider.setCustomParameters({
    prompt: "select_account",
  });

  return {
    status: "enabled",
    app,
    auth,
    db,
    provider,
  };
}
