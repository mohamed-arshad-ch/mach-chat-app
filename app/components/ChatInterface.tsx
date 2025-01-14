'use client'

import { useState, useEffect, useRef } from 'react'
import { auth, db } from '@/lib/firebase'
import { collection, addDoc, query, orderBy, onSnapshot, Timestamp, updateDoc, where, getDocs, doc } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { FiPaperclip, FiSend, FiLogOut, FiUser, FiFile, FiFilm, FiImage, FiX, FiMic, FiSquare } from 'react-icons/fi'
import Image from 'next/image'
import { Message, User as ChatUser } from '@/lib/types'
import CustomVoicePlayer from '@/components/CustomVoicePlayer'
import { Tooltip } from "@/components/ui/tooltip"

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

export default function ChatInterface() {
  const [user, setUser] = useState<ChatUser | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(true)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        if (user.email === 'mohamedarshadcholasseri5050@gmail.com') {
          router.push('/admin')
        } else {
          setUser(user)
        }
      } else {
        router.push('/')
      }
    })

    return () => unsubscribe()
  }, [router])

  useEffect(() => {
    if (user) {
      setIsLoadingMessages(true)
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
        setIsLoadingMessages(false)

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
    if ((newMessage.trim() || file || audioBlob) && user) {
      setIsSending(true)
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

        setNewMessage('')
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

  // If there's no user, show a loading state
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  return (
    <div className='flex flex-col h-screen bg-gray-100' >
      <header className="bg-white shadow ">
        <div className="max-w-7xl mx-auto py-2 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">MachChat</h1>
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center focus:outline-none"
            >
              <Image
                src={user?.photoURL || '/placeholder-avatar.png'}
                alt="User avatar"
                width={32}
                height={32}
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



      <main className=" flex-grow flex flex-col overflow-hidden">
        <>
        
            <div className="flex-grow overflow-y-auto mb-4 bg-gray-100 p-2 sm:p-4 rounded-lg">
              {isLoadingMessages ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
                </div>
              ) : (
                groupMessagesByDate(messages).map(([date, messages]) => (
                  <div key={date}>
                    <div className="text-center my-4">
                      <span className="bg-gray-200 text-gray-600 text-xs font-semibold px-2 py-1 rounded-full">
                        {date}
                      </span>
                    </div>
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.sendUser.uid === user?.uid ? 'justify-end' : 'justify-start'} mb-4`}
                      >
                        <div
                          className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                            message.sendUser.uid === user?.uid ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-900'
                          }`}
                        >
                         
                          {message.text && <p className="mb-2">{message.text}</p>}
                          {message.type === 'image' && (
                            <img src={message.fileData} alt="Uploaded image" className="max-w-full h-auto rounded" />
                          )}
                          {message.type === 'video' && (
                            <video src={message.fileData} controls className="max-w-full h-auto rounded" />
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
                          <div className="text-xs mt-1 flex justify-between">
                            <span>{message.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
        
        </>
      </main>



      <footer className="bg-white shadow">
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
              <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
                <div className="relative flex-grow">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="w-full pl-4 pr-12 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                {newMessage.trim() || file || audioBlob ? (
                  <button
                    type="submit"
                    className="p-2 rounded-full bg-indigo-500 hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
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
                        isRecording ? 'bg-red-500 text-white' : 'bg-indigo-500 hover:bg-indigo-600'
                      } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50`}
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
          </footer>
    </div>
  )
}

