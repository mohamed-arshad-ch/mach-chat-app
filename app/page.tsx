'use client' 

import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import AuthScreen from './components/AuthScreen'
import ChatInterface from './components/ChatInterface'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user)
      setLoading(false)
      if (user) {
        if (user.email === 'mohamedarshadcholasseri5050@gmail.com') {
          router.push('/admin')
        }
      }
    })

    return () => unsubscribe()
  }, [router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  return (
    <main className="flex min-h-screen flex-col">
      {user && user.email !== 'mohamedarshadcholasseri5050@gmail.com' ? <ChatInterface /> : <AuthScreen />}
    </main>
  )
}

