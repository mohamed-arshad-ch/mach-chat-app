'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { auth, db } from '@/lib/firebase'
import { collection, query, orderBy, onSnapshot, addDoc, where, Timestamp, getDocs, doc, updateDoc, } from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import { User } from 'firebase/auth'
import { FiSearch, FiPaperclip, FiSend, FiChevronLeft } from 'react-icons/fi'
import Image from 'next/image'
import { Message, User as ChatUser } from '@/lib/types'
import { signOut } from 'firebase/auth'

interface Conversation {
  user: ChatUser
  lastMessage: string
  lastMessageDate: Date
  unreadCount: number
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default function AdminPage() {
  const [adminUser, setAdminUser] = useState<User | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [allMessages, setAllMessages] = useState<Message[]>([])
  const [filteredMessages, setFilteredMessages] = useState<Message[]>([])
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null)
  const [replyText, setReplyText] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      router.push('/')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      console.log(user?.email,user?.uid,"email uid");
      
      if (user && user.email === 'mohamedarshadcholasseri5050@gmail.com') {
        setAdminUser(user)
      } else {
        router.push('/')
      }
    })

    return () => unsubscribe()
  }, [router])

  useEffect(() => {
    if (adminUser) {
      setIsLoading(true)
      const q = query(
        collection(db, 'messages'),
        orderBy('createdAt', 'desc')
      )
      
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const convMap = new Map<string, Conversation>()
        const messageList: Message[] = []
        querySnapshot.forEach((doc) => {
          const message = doc.data() as Message
          messageList.push({ id: doc.id, ...message })
          const userToAdd = message.sendUser.uid === adminUser.uid ? message.receiverUser : message.sendUser
          if (!convMap.has(userToAdd.uid)) {
            convMap.set(userToAdd.uid, {
              user: userToAdd,
              lastMessage: message.text,
              lastMessageDate: message.createdAt.toDate(),
              unreadCount: message.read || message.sendUser.uid === adminUser.uid ? 0 : 1
            })
          } else {
            const conv = convMap.get(userToAdd.uid)!
            if (!message.read && message.sendUser.uid !== adminUser.uid) {
              conv.unreadCount++
            }
            if (message.createdAt.toDate() > conv.lastMessageDate) {
              conv.lastMessage = message.text
              conv.lastMessageDate = message.createdAt.toDate()
            }
          }
        })
        setConversations(Array.from(convMap.values()))
        setAllMessages(messageList)
        setIsLoading(false)

      
      })

      return () => unsubscribe()
    }
  }, [adminUser])

  useEffect(() => {
   
    
    if (selectedUser && adminUser) {
      
      setIsLoadingMessages(true)
    
    
      const filtered = allMessages.filter(
        message => 
          (message.sendUser.uid === selectedUser.uid && message.receiverUser.uid === adminUser.uid) ||
          (message.sendUser.uid === adminUser.uid && message.receiverUser.uid === selectedUser.uid)
      ).sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis())

     

      setFilteredMessages(filtered)
      setIsLoadingMessages(false)

      // // Mark messages as read
      // filtered.forEach(async (message) => {
      //   if (!message.read && message.receiverUser.uid === adminUser.uid) {
      //     await updateDoc(doc(db, 'messages', message.id), { read: true })
      //   }
      // })
    } else {
      setFilteredMessages([])
    }
  }, [selectedUser, adminUser, allMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [filteredMessages])

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((replyText.trim() || file) && selectedUser && adminUser) {
      setIsSending(true)
      const messageData: Omit<Message, 'id'> = {
        text: replyText,
        sendUser: {
          uid: adminUser.uid,
          displayName: adminUser.displayName,
          photoURL: adminUser.photoURL,
          email: adminUser.email,
        },
        receiverUser: selectedUser,
        createdAt: Timestamp.now(),
        type: 'text',
        read: false,
      }

      try {
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

        setReplyText('')
        setFile(null)
      } catch (error) {
        console.error('Error sending message:', error)
        alert('Failed to send message. Please try again.')
      } finally {
        setIsSending(false)
      }
    }
  }


  useEffect(()=>{
console.log(filteredConversations,"filteredConversations");

  },[])
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size <= MAX_FILE_SIZE) {
        setFile(selectedFile);
      } else {
        alert('This file cannot be sent. Maximum file size is 5MB.');
        e.target.value = ''; // Reset the input
      }
    }
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  const filteredConversations = useMemo(() => {
    return conversations.filter(conv =>
      conv.user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.lastMessage.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [conversations, searchTerm])

  return (
    <div className="flex flex-col h-screen bg-gray-100">
    <header className="bg-white shadow-md">
      <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <div className="flex items-center space-x-4">
          {adminUser && (
            <Image
              src={adminUser.photoURL || '/placeholder-avatar.png'}
              alt="Admin avatar"
              width={40}
              height={40}
              className="rounded-full"
            />
          )}
          <button
            onClick={handleSignOut}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
    <div className="flex-grow flex overflow-hidden">
      <div className={`w-full md:w-1/3 flex flex-col ${selectedUser ? 'hidden md:flex' : ''}`}>
        <div className="p-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-2 pl-8 border rounded"
            />
            <FiSearch className="absolute left-2 top-3 text-gray-400" />
          </div>
        </div>
        <div className="flex-grow overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center items-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <div
                key={conv.user.uid}
                onClick={() => setSelectedUser(conv.user)}
                className={`p-4 mb-2 rounded cursor-pointer flex items-center ${
                  selectedUser?.uid === conv.user.uid ? 'bg-blue-100' : 'bg-white'
                }`}
              >
                <Image
                  src={conv.user.photoURL || '/placeholder-avatar.png'}
                  alt={conv.user.displayName || 'User'}
                  width={40}
                  height={40}
                  className="rounded-full mr-3"
                />
                <div className="flex-grow">
                  <p className="font-semibold">{conv.user.displayName || 'Anonymous'}</p>
                  <p className="text-sm text-gray-600 truncate">{conv.lastMessage}</p>
                </div>
                <div className="text-xs text-gray-500">
                  <p>{conv.lastMessageDate.toLocaleString()}</p>
                  {conv.unreadCount > 0 && (
                    <span className="bg-red-500 text-white px-2 py-1 rounded-full ml-2">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <div className={`w-full md:w-2/3 flex flex-col ${!selectedUser ? 'hidden md:flex' : ''}`}>
        {selectedUser ? (
          <>
            <div className="bg-white p-4 shadow-md flex items-center">
              <button 
                onClick={() => setSelectedUser(null)} 
                className="md:hidden mr-2 p-1 rounded-full hover:bg-gray-200"
              >
                <FiChevronLeft size={24} />
              </button>
              <Image
                src={selectedUser.photoURL || '/placeholder-avatar.png'}
                alt={selectedUser.displayName || 'User'}
                width={40}
                height={40}
                className="rounded-full mr-3"
              />
              <div>
                <h2 className="text-lg font-semibold">{selectedUser.displayName || 'Anonymous'}</h2>
                <p className="text-sm text-gray-500">{selectedUser.email}</p>
              </div>
            </div>
            <div className="flex-grow overflow-y-auto p-4">
              {isLoadingMessages ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
                </div>
              ) : (
                filteredMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`mb-4 ${message.sendUser.uid === adminUser?.uid ? 'text-right' : 'text-left'}`}
                  >
                    <div
                      className={`inline-block p-2 rounded-lg ${
                        message.sendUser.uid === adminUser?.uid ? 'bg-blue-500 text-white' : 'bg-white'
                      }`}
                    >
                      {message.type === 'text' && <p>{message.text}</p>}
                      {message.type === 'image' && (
                        <img src={message.fileData} alt="Uploaded image" className="max-w-xs h-auto rounded" />
                      )}
                      {message.type === 'file' && (
                        <a href={message.fileData} download={message.fileName} className="flex items-center space-x-2">
                          <FiPaperclip className="w-4 h-4" />
                          <span className="underline">{message.fileName}</span>
                        </a>
                      )}
                      <p className="text-xs mt-1 opacity-50">
                        {message.createdAt.toDate().toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="bg-white border-t p-4">
              <form onSubmit={handleReply} className="flex items-center space-x-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your reply..."
                  className="flex-grow p-2 border rounded"
                  disabled={isSending}
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept="image/*,video/*,application/*"
                  disabled={isSending}
                />
                <button
                  type="button"
                  onClick={triggerFileInput}
                  className="p-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                  disabled={isSending}
                >
                  <FiPaperclip className="w-5 h-5" />
                </button>
                <button
                  type="submit"
                  className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                  disabled={isSending}
                >
                  {isSending ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  ) : (
                    <FiSend className="w-5 h-5" />
                  )}
                </button>
              </form>
              {file && (
                <div className="mt-2 text-sm text-gray-600">
                  Selected file: {file.name}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full bg-gray-100">
            <p className="text-gray-500">Select a conversation to view messages</p>
          </div>
        )}
      </div>
    </div>
  </div>
  )
}

