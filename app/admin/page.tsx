'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { auth, db } from '@/lib/firebase'
import { collection, query, orderBy, onSnapshot, addDoc, where, Timestamp, getDocs, doc, updateDoc, } from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import { User } from 'firebase/auth'
import { FiSearch, FiPaperclip, FiSend, FiChevronLeft, FiFile, FiFilm, FiImage, FiX, FiMic, FiSquare } from 'react-icons/fi'
import Image from 'next/image'
import { Message, User as ChatUser } from '@/lib/types'
import { signOut } from 'firebase/auth'
import CustomVoicePlayer from '@/components/CustomVoicePlayer'
import { Tooltip } from "@/components/ui/tooltip"

interface Conversation {
  user: ChatUser
  lastMessage: string
  lastMessageDate: Date
  unreadCount: number
}

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

const formatDate = (date: Date) => {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) {
    return 'Today'
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday'
  } else {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  }
}

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
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
              lastMessage: message.text || (message.type === 'voice' ? 'Voice message' : 'File'),
              lastMessageDate: message.createdAt.toDate(),
              unreadCount: message.read || message.sendUser.uid === adminUser.uid ? 0 : 1
            })
          } else {
            const conv = convMap.get(userToAdd.uid)!
            if (!message.read && message.sendUser.uid !== adminUser.uid) {
              conv.unreadCount++
            }
            if (message.createdAt.toDate() > conv.lastMessageDate) {
              conv.lastMessage = message.text || (message.type === 'voice' ? 'Voice message' : 'File')
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

      // Mark messages as read
      filtered.forEach(async (message) => {
        if (!message.read && message.receiverUser.uid === adminUser.uid) {
          await updateDoc(doc(db, 'messages', message.id), { read: true })
        }
      })
    } else {
      setFilteredMessages([])
    }
  }, [selectedUser, adminUser, allMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [filteredMessages])

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime((prevTime) => prevTime + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((replyText.trim() || file || audioBlob) && selectedUser && adminUser) {
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
        if (audioBlob) {
          const reader = new FileReader()
          reader.onload = async (event) => {
            if (event.target && event.target.result) {
              messageData.type = 'voice'
              messageData.fileData = event.target.result as string
              messageData.fileName = 'voice_message.webm'
              messageData.fileType = 'audio/webm'
              await addDoc(collection(db, 'messages'), messageData)
            }
          }
          reader.readAsDataURL(audioBlob)
        } else if (file) {
          const reader = new FileReader()
          reader.onload = async (event) => {
            if (event.target && event.target.result) {
              messageData.type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file'
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
        setPreviewUrl(null)
        setAudioBlob(null)
      } catch (error) {
        console.error('Error sending message:', error)
        alert('Failed to send message. Please try again.')
      } finally {
        setIsSending(false)
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size <= MAX_FILE_SIZE) {
        setFile(selectedFile);
        if (selectedFile.type.startsWith('image/') || selectedFile.type.startsWith('video/')) {
          const url = URL.createObjectURL(selectedFile);
          setPreviewUrl(url);
        } else {
          setPreviewUrl(null);
        }
      } else {
        alert('This file cannot be sent. Maximum file size is 1MB.');
        e.target.value = ''; // Reset the input
        setFile(null);
        setPreviewUrl(null);
      }
    }
  }

  const removeFile = () => {
    setFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return <FiImage className="w-6 h-6" />;
    if (fileType.startsWith('video/')) return <FiFilm className="w-6 h-6" />;
    return <FiFile className="w-6 h-6" />;
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size <= MAX_FILE_SIZE) {
          setAudioBlob(audioBlob);
        } else {
          alert('Voice message is too large. Maximum size is 1MB.');
        }
        setIsRecording(false);
      };

      mediaRecorder.start();
      setIsRecording(true);

      // Automatically stop recording after 20 seconds
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          stopRecording();
        }
      }, 20000);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Failed to start recording. Please check your microphone permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setAudioBlob(null);
    audioChunksRef.current = [];
  };

  const filteredConversations = useMemo(() => {
    return conversations.filter(conv =>
      conv.user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.lastMessage.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [conversations, searchTerm])

  const groupMessagesByDate = (messages: Message[]) => {
    const grouped = messages.reduce((groups, message) => {
      const date = formatDate(message.createdAt.toDate())
      if (!groups[date]) {
        groups[date] = []
      }
      groups[date].push(message)
      return groups
    }, {} as Record<string, Message[]>)

    return Object.entries(grouped).sort((a, b) => {
      return new Date(b[0]).getTime() - new Date(a[0]).getTime()
    })
  }

  if (!adminUser) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
    <header className="bg-white shadow-md">
      <div className="max-w-7xl mx-auto py-2 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <div className="flex items-center space-x-4">
          {adminUser && (
            <Image
              src={adminUser.photoURL || '/placeholder-avatar.png'}
              alt="Admin avatar"
              width={32}
              height={32}
              className="rounded-full"
            />
          )}
          <button
            onClick={handleSignOut}
            className="px-3 py-1 sm:px-4 sm:py-2 bg-red-500 text-white text-sm rounded hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
    <div className="flex-grow flex overflow-hidden">
      <div className={`w-full md:w-1/3 flex flex-col ${selectedUser ? 'hidden md:flex' : ''}`}>
        <div className="p-2 sm:p-4">
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
        <div className="flex-grow overflow-y-auto px-2 sm:px-4">
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
            <div className="bg-white p-2 sm:p-4 shadow-md flex items-center">
              <button 
                onClick={() => setSelectedUser(null)} 
                className="md:hidden mr-2 p-1 rounded-full hover:bg-gray-200"
              >
                <FiChevronLeft size={24} />
              </button>
              <Image
                src={selectedUser.photoURL || '/placeholder-avatar.png'}
                alt={selectedUser.displayName || 'User'}
                width={32}
                height={32}
                className="rounded-full mr-3"
              />
              <div>
                <h2 className="text-sm sm:text-lg font-semibold">{selectedUser.displayName || 'Anonymous'}</h2>
                <p className="text-xs sm:text-sm text-gray-500">{selectedUser.email}</p>
              </div>
            </div>
            <div className="flex-grow overflow-y-auto p-2 sm:p-4">
              {isLoadingMessages ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
                </div>
              ) : (
                groupMessagesByDate(filteredMessages).map(([date, messages]) => (
                  <div key={date}>
                    <div className="text-center my-4">
                      <span className="bg-gray-200 text-gray-600 text-xs font-semibold px-2 py-1 rounded-full">
                        {date}
                      </span>
                    </div>
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`mb-4 ${message.sendUser.uid === adminUser?.uid ? 'text-right' : 'text-left'}`}
                      >
                        <div
                          className={`inline-block p-2 rounded-lg ${
                            message.sendUser.uid === adminUser?.uid ? 'bg-blue-500 text-white' : 'bg-white'
                          }`}
                        >
                          {message.text && <p className="mb-2">{message.text}</p>}
                          {message.type === 'image' && (
                            <img src={message.fileData} alt="Uploaded image" className="max-w-xs h-auto rounded" />
                          )}
                          {message.type === 'video' && (
                            <video src={message.fileData} className="max-w-xs h-auto rounded" controls />
                          )}
                          {message.type === 'file' && (
                            <a href={message.fileData} download={message.fileName} className="flex items-center space-x-2">
                              <FiPaperclip className="w-4 h-4" />
                              <span className="underline">{message.fileName}</span>
                            </a>
                          )}
                          {message.type === 'voice' && (
                            <CustomVoicePlayer audioSrc={message.fileData} />
                          )}
                          <p className="text-xs mt-1 opacity-50">
                            {message.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="bg-white border-t p-2 sm:p-4">
              <div className="max-w-7xl mx-auto py-2 px-4 sm:px-6 lg:px-8">
  {(file || audioBlob) && (
    <div className="mb-2 p-2 bg-gray-100 rounded-lg relative">
      {file && previewUrl ? (
        file.type.startsWith('image/') ? (
          <img src={previewUrl} alt="Selected file preview" className="max-w-xs h-auto rounded" />
        ) : (
          <video src={previewUrl} className="max-w-xs h-auto rounded" controls />
        )
      ) : file ? (
        <div className="flex items-center space-x-2">
          {getFileIcon(file.type)}
          <span className="text-sm text-gray-600">{file.name}</span>
        </div>
      ) : audioBlob ? (
        <div className="flex items-center space-x-2">
          <FiMic className="w-6 h-6" />
          <span className="text-sm text-gray-600">Voice message</span>
          <audio src={URL.createObjectURL(audioBlob)} controls className="max-w-full" />
        </div>
      ) : null}
      <button
        onClick={() => {
          removeFile();
          setAudioBlob(null);
        }}
        className="absolute top-1 right-1 p-1 bg-gray-200 rounded-full hover:bg-gray-300 focus:outline-none"
      >
        <FiX className="w-4 h-4" />
      </button>
    </div>
  )}
  <form onSubmit={handleReply} className="flex items-center space-x-2">
    <div className="relative flex-grow">
      <input
        type="text"
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        placeholder="Type your reply..."
        className="w-full pl-4 pr-12 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
        disabled={isSending || isRecording}
      />
      <div className="absolute inset-y-0 right-0 flex items-center pr-3">
        <button
          type="button"
          onClick={triggerFileInput}
          className="p-1 rounded-full text-gray-400 hover:text-gray-600 focus:outline-none"
          disabled={isSending || isRecording}
        >
          <FiPaperclip className="w-5 h-5" />
        </button>
      </div>
    </div>
    <input
      type="file"
      ref={fileInputRef}
      onChange={handleFileChange}
      className="hidden"
      accept="image/*,video/*,application/*"
      disabled={isSending || isRecording}
    />
    {replyText.trim() || file || audioBlob ? (
      <button
        type="submit"
        className="p-2 rounded-full bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        disabled={isSending || isRecording}
      >
        {isSending ? (
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
        ) : (
          <FiSend className="w-5 h-5 text-white" />
        )}
      </button>
    ) : (
      <Tooltip content="Record up to 20 seconds">
        <button
          type="button"
          onClick={toggleRecording}
          className={`p-2 rounded-full ${
            isRecording ? 'bg-red-500 text-white' : 'bg-blue-500 hover:bg-blue-600'
          } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50`}
          disabled={isSending}
        >
          {isRecording ? <FiSquare className="w-5 h-5" /> : <FiMic className="w-5 h-5 text-white" />}
        </button>
      </Tooltip>
    )}
  </form>
  {isRecording && (
    <div className="mt-2 text-center">
      <span className="text-sm text-red-500">
        Recording: {recordingTime}s / 20s
      </span>
    </div>
  )}
</div>
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

