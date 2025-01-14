'use client'

import { useState } from 'react'
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { FcGoogle } from 'react-icons/fc'

export default function AuthScreen() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError(null)
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
    } catch (err: any) {
      console.error(err)
      if (err.code === 'auth/unauthorized-domain') {
        setError('This domain is not authorized for authentication. Please check your Firebase configuration.')
      } else {
        setError('Failed to sign in. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Mach.chat
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to start messaging
          </p>
        </div>
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center px-4 py-2 group h-12 px-14 border-2 border-gray-300 rounded-full transition duration-300 text-black hover:border-blue-400 focus:bg-blue-50 active:bg-blue-100"
        >
         <div className="relative flex items-center space-x-4 justify-center">
    <img src="https://www.svgrepo.com/show/475656/google-color.svg"
        className="absolute left-0 w-5" alt="google logo"/>
   

    {loading ? <span
        className="block w-max pl-6 font-semibold tracking-wide text-gray-700  text-sm transition duration-300 group-hover:text-blue-600 sm:text-base">
       Signing in...
    </span> : <span
        className="block w-max pl-6 font-semibold tracking-wide text-gray-700  text-sm transition duration-300 group-hover:text-blue-600 sm:text-base">Continue
        with Google
    </span>}
</div>
         
        </button>
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </div>
    </div>
  )
}

{/* <button
class="group h-12 px-6 border-2 border-gray-300 rounded-full transition duration-300 hover:border-blue-400 focus:bg-blue-50 active:bg-blue-100">
<div class="relative flex items-center space-x-4 justify-center">
    <img src="https://www.svgrepo.com/show/475656/google-color.svg"
        class="absolute left-0 w-5" alt="google logo">
    <span
        class="block w-max font-semibold tracking-wide text-gray-700 dark:text-white text-sm transition duration-300 group-hover:text-blue-600 sm:text-base">Continue
        with Google
    </span>
</div>
</button> */}

