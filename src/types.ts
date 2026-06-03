/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  id: string;
  username: string;
  email?: string;
  avatarColor: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  userId: string;
  color: string;
  width: number;
  points: Point[];
  isComplete: boolean;
}

export interface FileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  senderName: string;
  timestamp: number;
}

export interface Message {
  id: string;
  room: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  type: 'text' | 'file';
  text: string; // Will store encrypted payload if E2EE is enabled
  isEncrypted: boolean;
  fileName?: string;
  fileSize?: number;
  fileUrl?: string;
  timestamp: number;
}

export interface RoomState {
  id: string;
  name: string;
  participants: { [socketId: string]: User };
  drawings: Stroke[];
  messages: Message[];
}
