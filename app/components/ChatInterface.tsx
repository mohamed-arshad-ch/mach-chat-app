'use client'

import { useState, useEffect, useRef } from 'react'
import { auth, db } from '@/lib/firebase'
import { collection, addDoc, query, orderBy, onSnapshot, Timestamp, updateDoc, where, getDocs, doc } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { FiPaperclip, FiSend, FiLogOut, FiUser } from 'react-icons/fi'
import Image from 'next/image'
import { Message, User as ChatUser } from '@/lib/types'

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

export default function ChatInterface() {
  const [user, setUser] = useState<ChatUser | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(true) // Added loading state
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUser(user)
      } else {
        router.push('/')
      }
    })

    return () => unsubscribe()
  }, [router])

  useEffect(() => {
    if (user) {
      setIsLoadingMessages(true) // Set loading to true before fetching messages
      const q = query(
        collection(db, 'messages'),
        orderBy('createdAt', 'asc')
      )
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const messageList: Message[] = []
        querySnapshot.forEach((doc) => {
          const messageData = doc.data() as Message
          if (messageData.sendUser.uid === user.uid || messageData.receiverUser.uid === user.uid) {
            messageList.push({ id: doc.id, ...messageData })
          }
        })
        setMessages(messageList)
        setIsLoadingMessages(false) // Set loading to false after fetching messages

        // Mark admin messages as read
        const adminMessages = messageList.filter(m => m.sendUser.uid !== user.uid && !m.read)
        adminMessages.forEach(async (message) => {
          await updateDoc(doc(db, 'messages', message.id), { read: true })
        })
      })

      return () => unsubscribe()
    }
  }, [user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      router.push('/')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((newMessage.trim() || file) && user) {
      const messageData: Omit<Message, 'id'> = {
        text: newMessage,
        sendUser: {
          uid: user.uid,
          displayName: user.displayName,
          photoURL: user.photoURL,
          email: user.email,
        },
        receiverUser: {
          uid: process.env.NEXT_PUBLIC_ADMIN_UID || "", // Replace with actual admin UID
          displayName: 'Admin',
          photoURL: null,
          email: 'mohamedarshadcholasseri5050@gmail.com',
        },
        createdAt: Timestamp.now(),
        type: 'text',
        read: false,
      }

      if (file) {
        const reader = new FileReader()
        reader.onload = async (event) => {
          if (event.target && event.target.result) {
            messageData.type = file.type.startsWith('image/') ? 'image' : 'file'
            messageData.fileData = event.target.result as string
            messageData.fileName = file.name
            messageData.fileType = file.type
            await addDoc(collection(db, 'messages'), messageData)
          }
        }
        reader.readAsDataURL(file)
      } else {
        await addDoc(collection(db, 'messages'), messageData)
      }

      setNewMessage('')
      setFile(null)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size <= MAX_FILE_SIZE) {
        setFile(selectedFile);
      } else {
        alert('This file cannot be sent. Maximum file size is 1MB.');
        e.target.value = ''; // Reset the input
      }
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">MachChat</h1>
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center focus:outline-none"
            >
              <Image
                src={user?.photoURL || '/placeholder-avatar.png'}
                alt="User avatar"
                width={40}
                height={40}
                className="rounded-full"
              />
            </button>
            {showDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-10">
                <button
                  onClick={() => {
                    // Handle profile click
                    setShowDropdown(false)
                  }}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                >
                  <FiUser className="inline mr-2" /> Profile
                </button>
                <button
                  onClick={() => {
                    handleSignOut()
                    setShowDropdown(false)
                  }}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                >
                  <FiLogOut className="inline mr-2" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="flex-grow overflow-hidden">
        <div className="max-w-7xl mx-auto h-full flex flex-col">
          <div className="flex-grow overflow-y-auto px-4 py-6">
            <div className="flex-grow overflow-y-auto mb-4 bg-gray-100 p-4 rounded-b-lg">
              {isLoadingMessages ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.sendUser.uid === user?.uid ? 'justify-end' : 'justify-start'} mb-4`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        message.sendUser.uid === user?.uid ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-900'
                      }`}
                    >
                      {message.sendUser.uid !== user?.uid && (
                        <p className="text-xs mb-1">From: {message.sendUser.displayName || 'Admin'}</p>
                      )}
                      {message.type === 'text' && <p>{message.text}</p>}
                      {message.type === 'image' && (
                        <img src={message.fileData} alt="Uploaded image" className="max-w-full h-auto rounded" />
                      )}
                      {message.type === 'file' && (
                        <a href={message.fileData} download={message.fileName} className="flex items-center space-x-2">
                          <FiPaperclip className="w-4 h-4" />
                          <span className="underline">{message.fileName}</span>
                        </a>
                      )}
                      <div className="text-xs mt-1 flex justify-between">
                        <span>{message.createdAt.toDate().toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
          <footer className="bg-white shadow">
            <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
              <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-grow px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept="image/*,application/*"
                />
                <button
                  type="button"
                  onClick={triggerFileInput}
                  className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <FiPaperclip className="w-5 h-5 text-gray-600" />
                </button>
                <button
                  type="submit"
                  className="p-2 rounded-full bg-indigo-500 hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <FiSend className="w-5 h-5 text-white" />
                </button>
              </form>
              {file && (
                <div className="mt-2">
                  <p className="text-sm text-gray-600">Selected file: {file.name}</p>
                </div>
              )}
            </div>
          </footer>
        </div>
      </main>
    </div>
  )
}

