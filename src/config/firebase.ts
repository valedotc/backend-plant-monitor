import admin from 'firebase-admin';

let firebaseInitialized = false;

export function initializeFirebase(): void {
  if (firebaseInitialized) {
    console.log('Firebase already initialized');
    return;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccountJson) {
    console.warn('FIREBASE_SERVICE_ACCOUNT not set - push notifications disabled');
    return;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    firebaseInitialized = true;
    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
  }
}

export function isFirebaseInitialized(): boolean {
  return firebaseInitialized;
}

export { admin };
