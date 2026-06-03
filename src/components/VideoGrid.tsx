/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect } from 'react';
import { User } from '../types';
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, PhoneOff, UserCheck, Play } from 'lucide-react';

interface RemotePlayerProps {
  stream: MediaStream;
  user: User;
  muted?: boolean;
}

// Bulletproof React streams player component
function TargetStreamPlayer({ stream, user, muted = false }: RemotePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative w-full h-full bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-md flex items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="w-full h-full object-cover rounded-2xl scale-x-[-1]" // mirror webcam
      />
      {/* Dynamic Name Overlay */}
      <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-sm border border-neutral-700/30 px-3.5 py-1.5 rounded-xl flex items-center gap-2">
        <div 
          className="w-2.5 h-2.5 rounded-full ring-2 ring-white/20"
          style={{ backgroundColor: user.avatarColor }}
        />
        <span className="text-[11px] font-bold text-white tracking-wide">{user.username}</span>
      </div>
    </div>
  );
}

interface VideoGridProps {
  localStream: MediaStream | null;
  remoteStreams: { [socketId: string]: MediaStream };
  roomParticipants: { [socketId: string]: User };
  localUser: User;
  audioMuted: boolean;
  videoMuted: boolean;
  screenSharing: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreen: () => void;
  onHangUp: () => void;
}

export default function VideoGrid({
  localStream,
  remoteStreams,
  roomParticipants,
  localUser,
  audioMuted,
  videoMuted,
  screenSharing,
  onToggleAudio,
  onToggleVideo,
  onToggleScreen,
  onHangUp,
}: VideoGridProps) {
  
  const remotePeersList = Object.entries(remoteStreams);

  // Auto layout density calculations
  const gridColumnsClass = () => {
    const total = 1 + remotePeersList.length;
    if (total === 1) return 'grid-cols-1 max-w-xl mx-auto';
    if (total === 2) return 'grid-cols-1 md:grid-cols-2 max-w-4xl mx-auto';
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
  };

  return (
    <div id="video-workspace-container" className="flex flex-col h-full bg-neutral-950 rounded-2xl overflow-hidden p-6 gap-6 relative shadow-inner">
      
      {/* 1. Large WebRTC Player Grid */}
      <div id="webrtc-streams-grid" className={`flex-1 grid gap-4 items-center justify-center content-center ${gridColumnsClass()}`}>
        
        {/* Local Webcam Screen */}
        <div id="local-video-shell" className="relative w-full h-full aspect-video bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-md flex items-center justify-center">
          {localStream && !videoMuted ? (
            <video
              id="local-media-vid"
              ref={(ref) => {
                if (ref && localStream) ref.srcObject = localStream;
              }}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover rounded-2xl scale-x-[-1]"
            />
          ) : (
            <div className="absolute inset-0 bg-neutral-950 flex flex-col items-center justify-center text-gray-500 gap-3 rounded-2xl">
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center text-rose-500 shadow-xl border border-neutral-800 bg-neutral-900"
              >
                <VideoOff className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-gray-400">Webcam Muted</p>
            </div>
          )}

          <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md border border-neutral-700/50 px-3.5 py-1.5 rounded-xl flex items-center gap-2">
            <div 
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: localUser.avatarColor }}
            />
            <span className="text-[11px] font-bold text-white tracking-wide">{localUser.username} (You)</span>
          </div>

          <div className="absolute top-4 right-4 flex gap-1.5">
            {audioMuted && (
              <div className="p-1 px-1.5 bg-rose-600 border border-rose-500 text-white rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
                <MicOff className="w-3 h-3" /> Silent
              </div>
            )}
            {screenSharing && (
              <div className="p-1 px-1.5 bg-indigo-600 border border-indigo-500 text-white rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
                <Monitor className="w-3 h-3 animate-pulse" /> Sharing Screen
              </div>
            )}
          </div>
        </div>

        {/* Remote Caller Screens */}
        {remotePeersList.map(([socketId, remoteStream]) => {
          const peerDetails = roomParticipants[socketId] || {
            id: 'unknown',
            username: `Caller ${socketId.substring(0, 4)}`,
            avatarColor: '#4f46e5',
          };

          return (
            <div key={socketId} className="relative w-full h-full aspect-video">
              <TargetStreamPlayer
                stream={remoteStream}
                user={peerDetails}
              />
            </div>
          );
        })}
      </div>

      {/* Lobby Visual (If alone) */}
      {remotePeersList.length === 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center text-center text-neutral-500 space-y-2 pointer-events-none opacity-40">
          <Play className="w-12 h-12 stroke-1 animate-ping text-indigo-500 mb-2" />
          <h4 className="text-sm font-bold text-neutral-300">Waiting for connections...</h4>
          <p className="text-xs text-neutral-400">Invite peers with your Room Code to begin WebRTC session</p>
        </div>
      )}

      {/* 2. Dock Audio/Video Controls Bar */}
      <div id="media-dock-controls" className="flex items-center justify-center gap-4 bg-neutral-900/95 border border-neutral-800 py-3.5 px-6 rounded-2xl w-fit mx-auto shadow-2xl backdrop-blur-md">
        
        {/* Toggle Speech */}
        <button
          id="dock-toggle-audio-btn"
          onClick={onToggleAudio}
          className={`p-3 rounded-xl cursor-pointer hover:scale-105 active:scale-95 transition-all flex items-center justify-center ${
            audioMuted 
              ? 'bg-rose-600 text-white shadow-lg shadow-rose-1200' 
              : 'bg-neutral-800 text-gray-100 hover:bg-neutral-750'
          }`}
          title={audioMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {audioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Toggle Webcam */}
        <button
          id="dock-toggle-video-btn"
          onClick={onToggleVideo}
          className={`p-3 rounded-xl cursor-pointer hover:scale-105 active:scale-95 transition-all flex items-center justify-center ${
            videoMuted 
              ? 'bg-rose-600 text-white shadow-lg shadow-rose-1200' 
              : 'bg-neutral-800 text-gray-100 hover:bg-neutral-750'
          }`}
          title={videoMuted ? 'Turn on camera' : 'Turn off camera'}
        >
          {videoMuted ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>

        {/* Toggle Display Share */}
        <button
          id="dock-toggle-screen-btn"
          onClick={onToggleScreen}
          className={`p-3 rounded-xl cursor-pointer hover:scale-105 active:scale-95 transition-all flex items-center justify-center ${
            screenSharing 
              ? 'bg-indigo-650 text-white shadow-lg shadow-indigo-1200' 
              : 'bg-neutral-800 text-gray-100 hover:bg-neutral-750'
          }`}
          title={screenSharing ? 'Stop screen sharing' : 'Start screen sharing'}
        >
          {screenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
        </button>

        <span className="h-6 w-px bg-neutral-800 mx-1"></span>

        {/* Hangup button */}
        <button
          id="dock-hangup-btn"
          onClick={onHangUp}
          className="p-3 bg-rose-650 hover:bg-rose-700 text-white rounded-xl shadow-lg shadow-rose-1100 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
          title="Leave meeting room"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>

    </div>
  );
}
