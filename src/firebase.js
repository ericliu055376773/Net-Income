import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyCjYnTiry-vuRbnIfqeTnGsGvbJkCcXpGc",
  authDomain: "net-income-e6a41.firebaseapp.com",
  projectId: "net-income-e6a41",
  storageBucket: "net-income-e6a41.firebasestorage.app",
  messagingSenderId: "870464327098",
  appId: "1:870464327098:web:df64397623841bdfcba183"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
