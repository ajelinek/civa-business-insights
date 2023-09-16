// Import the functions you need from the SDKs you need
import { getAnalytics } from "firebase/analytics"
import { initializeApp } from "firebase/app"
import { getAuth, connectAuthEmulator } from "firebase/auth"
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore"
import { getStorage, connectStorageEmulator } from "firebase/storage"
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyClvptQ7mTQEW3JcJH5S4-jdTz670zaA5I",
  authDomain: "civa-business-insights.firebaseapp.com",
  projectId: "civa-business-insights",
  storageBucket: "civa-business-insights.appspot.com",
  messagingSenderId: "78359797855",
  appId: "1:78359797855:web:5ae30c7b45fdd7e84f3bea",
  measurementId: "G-HPKVDGW189"
}


// Initialize Firebase
const app = initializeApp(firebaseConfig)

export const analytics = getAnalytics(app)
export const db = getFirestore()
export const auth = getAuth()
export const storage = getStorage(app)

if (process.env.NODE_ENV !== 'production') {
  connectFirestoreEmulator(db, 'localhost', 8080)
  connectAuthEmulator(auth, "http://localhost:9099")
  connectStorageEmulator(storage, 'localhost', 9199)
}