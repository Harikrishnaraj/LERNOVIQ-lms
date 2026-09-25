export interface InstructorMessageThread {
  threadId: string;
  courseId: string;
  courseTitle: string;
  learnerId: string;
  learnerName: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface DirectMessage {
  messageId: string;
  senderId: string;
  senderName: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  isMine: boolean;
}

export const MESSAGE_MAX_LEN = 4000;
