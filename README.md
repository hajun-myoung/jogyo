# Jogyo Clock

Next.js + TypeScript + TailwindCSS based exam clock for classroom projection.

The app works in local mode without login. Local settings and presets are saved
in `localStorage`. When Firebase is configured, users can sign in with Google
and manually back up or restore presets and last settings from Firestore.

## Run

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Firebase Setup

1. Create a Firebase project.
2. Add a Web app in Firebase Console.
3. Enable Google as an Auth provider.
4. Create a Firestore Database.
5. Copy `.env.local.example` to `.env.local` and fill in the values.
6. Apply Firestore rules similar to [FIREBASE_RULES.md](./FIREBASE_RULES.md).

Required environment variables:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

If these variables are missing, the clock still works in local mode and the
cloud buttons are disabled with a setup notice.
