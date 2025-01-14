import { Timestamp } from 'firebase/firestore'

export interface User {
  uid: string
  displayName: string | null
  photoURL: string | null
  email: string | null
}

export interface Message {
  id: string
  text: string
  sendUser: User
  receiverUser: User
  createdAt: Timestamp
  type: 'text' | 'image' | 'file' | 'voice' | 'video'
  fileData?: string
  fileName?: string
  fileType?: string
  read?: boolean
}

