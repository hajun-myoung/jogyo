# Firebase Security Rules

Jogyo Clock stores user-owned cloud data under `users/{uid}` and public viewer
documents under `sharedClocks/{shareId}`.

Use rules like the following so users can only manage their own data, while
public share links can be read without login.

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    match /sharedClocks/{shareId} {
      allow read: if resource.data.isPublic == true;
      allow create: if request.auth != null
        && request.resource.data.ownerUid == request.auth.uid;
      allow update, delete: if request.auth != null
        && resource.data.ownerUid == request.auth.uid
        && request.resource.data.ownerUid == resource.data.ownerUid;
    }
  }
}
```

This project does not use Firebase Storage for logos yet. Logos remain data URLs
inside local settings and Firestore documents.

If you use `expiresAt`, you may make public reads stricter by also checking that
`resource.data.expiresAt == null || resource.data.expiresAt > request.time.toMillis()`.
