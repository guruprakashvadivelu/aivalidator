import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDK46UiKnPxMketKxxfnYdifDpIv3wKdvc",
  authDomain: "chat-4d5f4.firebaseapp.com",
  databaseURL: "https://chat-4d5f4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chat-4d5f4",
  storageBucket: "chat-4d5f4.appspot.com",
  messagingSenderId: "525378181835",
  appId: "1:525378181835:web:a6c01ff3027c75c246d94e"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const storage = getStorage(app);
export default app;
