import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyB-e9U4L8FGmeH8ENzpeJwf69wJ1nQfpw0",
  authDomain: "scoringtest-a0437.firebaseapp.com",
  databaseURL: "https://scoringtest-a0437-default-rtdb.firebaseio.com",
  projectId: "scoringtest-a0437",
  storageBucket: "scoringtest-a0437.firebasestorage.app",
  messagingSenderId: "767930969632",
  appId: "1:767930969632:web:fa1a7a0750044a358c9645",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
