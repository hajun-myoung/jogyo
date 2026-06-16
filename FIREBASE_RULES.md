# Firebase Security Rules

Jogyo Clock stores each user's cloud data under `users/{uid}`.
Use rules like the following so users can only read and write their own data.

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

This project does not use Firebase Storage for logos yet. Logos remain data URLs
inside local settings and Firestore documents.
