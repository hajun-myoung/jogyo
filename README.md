# Jogyo Clock

Next.js + TypeScript + TailwindCSS based exam clock for classroom projection.

The app works in local mode without login. Local settings and presets are saved
in `localStorage`. When Firebase is configured, users can sign in with Google
and manually back up or restore presets and last settings from Firestore.

Logged-in users can also create classroom/room entries and publish read-only
share links. Anyone with a `/share/{shareId}` link can open the viewer without
signing in while the share is public.

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
7. Add your deployed domain to Google Auth authorized domains, for example
   `clock.jogyo.web.app`.

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

## Sharing And Rooms

- Create rooms from the setup panel after signing in.
- Select a room before creating a share link to include `roomId` and `roomName`
  in the shared clock document.
- The QR code points to the current share URL.
- The viewer page is read-only: no setup panel, no supervisor controls, and no
  shortcut mutations.
- Use "공유 시계 업데이트" after changing time, pause state, theme, logo, or
  instructions if you want viewers to see the latest state.
- Use "공유 중지" to make the viewer link unavailable.
