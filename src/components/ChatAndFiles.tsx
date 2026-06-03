/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { Message, User } from '../types';
import { encryptText, decryptText } from '../lib/crypto';
import { Send, FileUp, Shield, ShieldAlert, ShieldCheck, Download, DownloadCloud, FileText, UserCheck, Lock, Users } from 'lucide-react';

interface ChatAndFilesProps {
  socket: Socket | null;
  roomId: string;
  user: User;
  initialMessages: Message[];
  participants: { [socketId: string]: User };
}

export default function ChatAndFiles({ socket, roomId, user, initialMessages, participants }: ChatAndFilesProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [decryptedMessages, setDecryptedMessages] = useState<{ [msgId: string]: string }>({});
  const [inputText, setInputText] = useState('');
  
  // E2EE States
  const [e2eeEnabled, setE2eeEnabled] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  
  // File Upload States
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync initial message history on join
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  // Listener for incoming socket messages
  useEffect(() => {
    if (!socket) return;

    const handleMessageReceived = (msg: Message) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    socket.on('message-received', handleMessageReceived);

    return () => {
      socket.off('message-received', handleMessageReceived);
    };
  }, [socket]);

  // Trigger reactive E2EE decryption loop whenever active messages list or active secret key alters
  useEffect(() => {
    const decryptAll = async () => {
      const decs: { [msgId: string]: string } = {};
      for (const msg of messages) {
        if (msg.isEncrypted) {
          if (secretKey) {
            const dec = await decryptText(msg.text, secretKey);
            decs[msg.id] = dec;
          } else {
            decs[msg.id] = '[🔒 E2EE Encrypted Message]';
          }
        } else {
          decs[msg.id] = msg.text;
        }
      }
      setDecryptedMessages(decs);
    };

    decryptAll();
  }, [messages, secretKey]);

  // Handle message auto-scroll to bottom of chat list
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, decryptedMessages]);

  // Text message delivery
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !socket) return;

    let payloadText = inputText.trim();
    
    // Encrypt payload client-side if toggle is active
    if (e2eeEnabled && secretKey) {
      payloadText = await encryptText(payloadText, secretKey);
    }

    const newMessage: Message = {
      id: Math.random().toString(36).substring(2, 9),
      room: roomId,
      senderId: user.id,
      senderName: user.username,
      senderColor: user.avatarColor,
      type: 'text',
      text: payloadText,
      isEncrypted: e2eeEnabled && !!secretKey,
      timestamp: Date.now(),
    };

    socket.emit('send-message', newMessage);
    setInputText('');
  };

  // Convert binary file stream to Base64 in-browser and push to Express API
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !socket) return;
    
    const file = files[0];
    if (file.size > 20 * 1024 * 1024) { // Bounded at 20MB
      alert('Selected file is too large. Upload limit is strict at 20MB.');
      return;
    }

    setUploading(true);
    setUploadProgress(10);

    const reader = new FileReader();
    reader.onload = async () => {
      setUploadProgress(40);
      const base64Data = reader.result as string;
      
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type,
            base64Data,
            senderName: user.username,
          }),
        });

        setUploadProgress(70);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Upload pipeline failed.');
        }

        setUploadProgress(90);

        // Send file metadata ticket over socket channel
        const fileMessage: Message = {
          id: Math.random().toString(36).substring(2, 9),
          room: roomId,
          senderId: user.id,
          senderName: user.username,
          senderColor: user.avatarColor,
          type: 'file',
          text: `Shared dynamic file: ${file.name}`,
          isEncrypted: false, // Core files are hosted securely on local static uploads
          fileName: file.name,
          fileSize: file.size,
          fileUrl: data.url,
          timestamp: Date.now(),
        };

        socket.emit('send-message', fileMessage);
        
      } catch (err: any) {
        console.error('File upload error:', err);
        alert(`Failed to share file: ${err.message || 'Server error'}`);
      } finally {
        setUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsDataURL(file);
  };

  // Utility to convert raw file sizes cleanly
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div id="chat-files-container" className="grid grid-rows-1 xl:grid-cols-[1fr_260px] h-full gap-5">
      
      {/* LEFT SECTION: Secure Chat Board */}
      <div id="chat-board" className="flex flex-col h-full bg-white border border-gray-150 rounded-2xl overflow-hidden shadow-xs">
        
        {/* Encryption Safety controller header */}
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-150 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-500" />
            <h3 className="font-bold text-gray-900 text-sm">E2E Secure Chat</h3>
          </div>

          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-700">
              <input
                id="e2ee-toggle-checkbox"
                type="checkbox"
                checked={e2eeEnabled}
                onChange={(e) => setE2eeEnabled(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
              />
              Enable Client Encryption (E2EE)
            </label>

            {e2eeEnabled && (
              <div className="flex items-center gap-1.5 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-150">
                <Lock className="w-3.5 h-3.5 text-indigo-600" />
                <input
                  id="secret-key-input"
                  type="password"
                  placeholder="Cipher Room Key"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  className="w-24 bg-transparent outline-none border-none text-[11px] font-bold text-indigo-700 placeholder-indigo-400"
                  title="All text messages typed or decrypted will use this custom key"
                />
              </div>
            )}
          </div>
        </div>

        {/* Messaging Logs Box */}
        <div id="messaging-scroll-box" ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-4 bg-gray-50/30">
          {messages.map((msg) => {
            const isSelf = msg.senderId === user.id;
            const textContent = decryptedMessages[msg.id] || msg.text;
            const isLocked = msg.isEncrypted && textContent.includes('[🔒');

            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 max-w-[85%] ${isSelf ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
              >
                {/* Visual Avatar Bubble */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-xs flex-shrink-0"
                  style={{ backgroundColor: msg.senderColor || '#6366f1' }}
                >
                  {msg.senderName.charAt(0).toUpperCase()}
                </div>

                <div className="space-y-1">
                  {/* Name header */}
                  <div className={`flex items-center gap-1.5 text-xs text-gray-500 ${isSelf ? 'justify-end' : ''}`}>
                    <span className="font-semibold text-gray-600">{msg.senderName}</span>
                    <span>•</span>
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  {/* Body Bubble */}
                  {msg.type === 'text' ? (
                    <div
                      className={`p-3 rounded-2xl text-xs leading-relaxed shadow-xs ${
                        isSelf 
                          ? 'bg-indigo-650 text-white rounded-tr-none' 
                          : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none'
                      }`}
                    >
                      {msg.isEncrypted && (
                        <div className={`flex items-center gap-1 mb-1 text-[10px] font-semibold tracking-wide uppercase ${isSelf ? 'text-indigo-205' : 'text-indigo-600'}`}>
                          {isLocked ? (
                            <>
                              <ShieldAlert className="w-3 h-3" /> E2EE Locked
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-3 h-3" /> E2EE Secure Decrypted
                            </>
                          )}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap select-text break-words font-sans">{textContent}</p>
                    </div>
                  ) : (
                    /* Render shared File Item Ticket */
                    <div className="p-3 bg-white border border-gray-150 rounded-xl shadow-xs flex items-center gap-4 hover:shadow-md transition-shadow">
                      <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-gray-900 truncate" title={msg.fileName}>
                          {msg.fileName}
                        </p>
                        <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                          {msg.fileSize ? formatBytes(msg.fileSize) : 'N/A'}
                        </p>
                      </div>
                      <a
                        href={msg.fileUrl}
                        download={msg.fileName}
                        className="p-2 bg-gray-50 hover:bg-gray-100 text-indigo-600 border border-gray-200 rounded-lg transition-colors cursor-pointer"
                        title="Download Shared File"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 p-6 text-center">
              <Users className="w-10 h-10 stroke-1 mb-2 text-indigo-300" />
              <p className="text-xs font-medium">Session initialized. Send a secure text or upload any project files below.</p>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSendMessage} className="p-3 bg-gray-50 border-t border-gray-150 flex items-center gap-2">
          {/* File selector trigger button */}
          <button
            id="file-upload-btn-trigger"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="p-2.5 bg-white hover:bg-gray-150 border border-gray-200 text-gray-700 rounded-xl transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Upload and Share File (Max 20MB)"
          >
            <FileUp className="w-4 h-4" />
          </button>
          
          <input
            id="hidden-files-asset-picker"
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />

          <input
            id="chat-text-input-field"
            type="text"
            placeholder={e2eeEnabled ? "Type an end-to-end encrypted message..." : "Type clear chat message..."}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="flex-1 text-xs px-4 py-2.5 bg-white border border-gray-250 rounded-xl focus:outline-none focus:border-indigo-500 text-gray-800 transition-colors"
          />

          <button
            id="chat-send-submit-btn"
            type="submit"
            className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-1200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer transition-all"
            title="Send chat payload"
          >
            <Send className="w-4 h-4 font-bold" />
          </button>
        </form>

        {/* Loading upload progress meter bar */}
        {uploading && (
          <div className="bg-indigo-50 px-4 py-2 border-t border-indigo-100 flex items-center gap-3">
            <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <div className="flex-1">
              <div className="flex justify-between text-[10px] text-indigo-750 font-bold mb-0.5">
                <span>Uploading payload to server...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-indigo-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT SECTION: Meeting Roster & Metadata Panel */}
      <div id="roster-panel" className="hidden xl:flex flex-col bg-white border border-gray-150 rounded-2xl overflow-hidden p-5 shadow-xs">
        <div className="flex items-center gap-2 pb-3.5 border-b border-gray-100 mb-4">
          <Users className="w-4 h-4 text-indigo-500" />
          <h4 className="font-bold text-gray-950 text-xs uppercase tracking-wider">Roster ({Object.keys(participants).length})</h4>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {Object.entries(participants).map(([socketId, clientUser]) => {
            const isLocal = clientUser.id === user.id;

            return (
              <div key={socketId} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-xl transition-colors border border-gray-50">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-xs"
                    style={{ backgroundColor: clientUser.avatarColor || '#6366f1' }}
                  >
                    {clientUser.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate" title={clientUser.username}>
                      {clientUser.username}
                    </p>
                    <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider mt-0.5">
                      {isLocal ? 'Operator (You)' : 'Peer Client'}
                    </p>
                  </div>
                </div>

                {isLocal && (
                  <div className="flex items-center gap-1 text-[9px] text-emerald-800 bg-emerald-50 px-2 py-0.5 font-bold rounded-full border border-emerald-100 uppercase tracking-widest flex-shrink-0">
                    <UserCheck className="w-2.5 h-2.5" /> Self
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-gray-100 bg-neutral-50 rounded-xl p-3 text-[10px] text-gray-500 space-y-1.5 border border-dashed border-gray-250">
          <span className="font-bold text-gray-700 inline-block">Room Key:</span>
          <p className="font-mono bg-white p-1.5 border border-gray-200 rounded text-center text-xs text-indigo-700 font-bold tracking-tight">
            {roomId}
          </p>
        </div>
      </div>

    </div>
  );
}
