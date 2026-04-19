import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer, CACHE_SIZE_UNLIMITED } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const config = firebaseConfig as any;
const app = initializeApp(config);

// Use initializeFirestore with experimentalForceLongPolling to bypass potential websocket issues
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, config.firestoreDatabaseId);

export const auth = getAuth(app);

async function testConnection() {
  try {
    // Attempting a simple read from a known-opened path
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firebase connection established successfully.");
  } catch (error: any) {
    console.error("Firebase connection test failed:", error.message || error);
    if (error.message?.includes('Missing or insufficient permissions')) {
      console.warn("Permission Error detected. Re-check logic: Rules are set to public allow-all.");
    }
  }
}
testConnection();
