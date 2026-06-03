/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Socket, io } from 'socket.io-client';
import { User, RoomState, Stroke, Message } from '../types';
import DeviceSelection from './DeviceSelection';
import VideoGrid from './VideoGrid';
import Whiteboard from './Whiteboard';
import ChatAndFiles from './ChatAndFiles';
import { Play, HelpCircle, Laptop, BookOpen, Layers, Keyboard, Video, Edit3, MessageSquare, Plus, ArrowRight, Compass, ShieldAlert } from 'lucide-react';

interface MainScreenProps {
  user: User;
  onLogout: () => void;
}

export default function MainScreen({ user, onLogout }: MainScreenProps) {
  // Phase Routing
  const [inMeeting, setInMeeting] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [activeTab, setActiveTab] = useState<'video' | 'whiteboard'>('video');

  // Device configuration settings
  const [showDeviceSelection, setShowDeviceSelection] = useState(false);
  const [deviceConstraints, setDeviceConstraints] = useState<MediaStreamConstraints | null>(null);

  // States
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<{ [socketId: string]: MediaStream }>({});
  const [participants, setParticipants] = useState<{ [socketId: string]: User }>({});
  
  // Collaborative cached states
  const [initialDrawings, setInitialDrawings] = useState<Stroke[]>([]);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);

  // Toggles
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);

  // Refs for background async socket / WebRTC structures
  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const pcs = useRef<{ [socketId: string]: RTCPeerConnection }>({});

  // Guide panel tab switcher
  const [guideTab, setGuideTab] = useState<'intro' | 'setup' | 'run'>('intro');

  // Trigger room initiation
  const handleRoomCreateInit = () => {
    const randomCode = Math.random().toString(36).substring(2, 5) + '-' +
                      Math.random().toString(36).substring(2, 5) + '-' +
                      Math.random().toString(36).substring(2, 5);
    setRoomId(randomCode);
    setShowDeviceSelection(true);
  };

  const handleRoomJoinInit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId.trim()) return;
    setShowDeviceSelection(true);
  };

  // Cleanup effect
  useEffect(() => {
    return () => {
      hangUpMeeting(false);
    };
  }, []);

  // Set up device selection settings and launch socket tunnel
  const onDevicesSelected = (constraints: MediaStreamConstraints) => {
    setDeviceConstraints(constraints);
    setShowDeviceSelection(false);
    startMeeting(constraints);
  };

  // Launch the active meeting room integration
  const startMeeting = async (constraints: MediaStreamConstraints) => {
    try {
      // 1. Fetch mic/webcam hardware tracks
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      localStreamRef.current = stream;

      // 2. Establish connection to Socket.io server
      const socket = io(window.location.origin);
      socketRef.current = socket;

      // 3. Mount real-time Event Listeners
      socket.on('connect', () => {
        // Submit joining protocols
        socket.emit('join-room', { roomId, user });
      });

      // Synchronize backlogged records (drawing line history, chat transcripts)
      socket.on('room-status', ({ participants: roomUsers, messages, drawings }: { participants: any; messages: Message[]; drawings: Stroke[] }) => {
        setParticipants(roomUsers);
        setInitialMessages(messages);
        setInitialDrawings(drawings);
        setInMeeting(true);

        // Initiate RTC connection to every client currently in the room
        Object.entries(roomUsers).forEach(([socketId, attendee]) => {
          if (socketId !== socket.id) {
            initiateCall(socketId);
          }
        });
      });

      // New peer enters lobby
      socket.on('user-joined', ({ socketId, user: joinedUser }: { socketId: string; user: User }) => {
        setParticipants(prev => ({ ...prev, [socketId]: joinedUser }));
        console.log(`Attendee registered on signaling mesh: ${joinedUser.username}`);
      });

      // Peer leaves lobby
      socket.on('user-left', ({ socketId }: { socketId: string }) => {
        // Purge RTCPeerConnection and stream
        const pc = pcs.current[socketId];
        if (pc) {
          pc.close();
          delete pcs.current[socketId];
        }

        setRemoteStreams(prev => {
          const fresh = { ...prev };
          delete fresh[socketId];
          return fresh;
        });

        setParticipants(prev => {
          const fresh = { ...prev };
          delete fresh[socketId];
          return fresh;
        });
      });

      // Capture signal relays from target peers
      socket.on('signal-received', ({ senderSocketId, signalData }: { senderSocketId: string; senderUser: User; signalData: any }) => {
        if (signalData.type === 'offer') {
          handleOffer(senderSocketId, signalData.sdp);
        } else if (signalData.type === 'answer') {
          handleAnswer(senderSocketId, signalData.sdp);
        } else if (signalData.type === 'candidate') {
          handleCandidate(senderSocketId, signalData.candidate);
        }
      });

      // Capture media muting notification from peers
      socket.on('media-toggled', ({ socketId, type, enabled }: { socketId: string; type: 'audio' | 'video'; enabled: boolean }) => {
        // Optional reactive display can go here if needed.
      });

    } catch (err) {
      console.error('Error starting WebRTC media capture:', err);
      alert('Could not start microphone or camera. Please verify device permissions.');
      hangUpMeeting(false);
    }
  };

  // RTC Peer Connection Config (STUN routing)
  const createPeerConnection = (targetSocketId: string) => {
    if (pcs.current[targetSocketId]) return pcs.current[targetSocketId];

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
    });

    pcs.current[targetSocketId] = pc;

    // Attach local hardware tracks before handshaking
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle candidates discovered locally
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('send-signal', {
          targetSocketId,
          signalData: { type: 'candidate', candidate: event.candidate },
        });
      }
    };

    // Receive remote video/audio track stream from target peer
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStreams(prev => ({
          ...prev,
          [targetSocketId]: event.streams[0],
        }));
      }
    };

    return pc;
  };

  // Initiate dynamic Handshake (Offer creation)
  const initiateCall = async (targetSocketId: string) => {
    try {
      const pc = createPeerConnection(targetSocketId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketRef.current?.emit('send-signal', {
        targetSocketId,
        signalData: { type: 'offer', sdp: offer },
      });
    } catch (err) {
      console.error('Failed to create handshaking offer:', err);
    }
  };

  // Receive Handshake (Answer creation)
  const handleOffer = async (senderSocketId: string, offerSdp: RTCSessionDescriptionInit) => {
    try {
      const pc = createPeerConnection(senderSocketId);
      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketRef.current?.emit('send-signal', {
        targetSocketId: senderSocketId,
        signalData: { type: 'answer', sdp: answer },
      });
    } catch (err) {
      console.error('Failed to parse remote WebRTC offer:', err);
    }
  };

  // Process Answer callback
  const handleAnswer = async (senderSocketId: string, answerSdp: RTCSessionDescriptionInit) => {
    try {
      const pc = pcs.current[senderSocketId];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
      }
    } catch (err) {
      console.error('Failed to settle remote session answer:', err);
    }
  };

  // Append Ice Candidates
  const handleCandidate = async (senderSocketId: string, candidate: RTCIceCandidateInit) => {
    try {
      const pc = pcs.current[senderSocketId];
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (err) {
      console.error('Error attaching candidate stream piece:', err);
    }
  };

  // Mute audio
  const toggleAudio = () => {
    if (localStreamRef.current) {
      const state = !audioMuted;
      localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !state);
      setAudioMuted(state);
      
      socketRef.current?.emit('toggle-media', {
        streamId: localStreamRef.current.id,
        type: 'audio',
        enabled: !state,
      });
    }
  };

  // Mute video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const state = !videoMuted;
      localStreamRef.current.getVideoTracks().forEach(t => t.enabled = !state);
      setVideoMuted(state);

      socketRef.current?.emit('toggle-media', {
        streamId: localStreamRef.current.id,
        type: 'video',
        enabled: !state,
      });
    }
  };

  // Toggles screen sharing via track replacing
  const toggleScreenShare = async () => {
    if (screenSharing) {
      // Deactivate Screen Share
      stopScreenShare();
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = stream;
        const screenTrack = stream.getVideoTracks()[0];

        // Replace track across all mesh active peer connections
        (Object.values(pcs.current) as RTCPeerConnection[]).forEach(pc => {
          const senders = pc.getSenders();
          const sender = senders.find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });

        // Trigger local display loop
        setScreenSharing(true);

        // Revert cleanly if user clicks "Stop Sharing" on Chrome core interface
        screenTrack.onended = () => {
          stopScreenShare();
        };

      } catch (err) {
        console.error('Screen capture rejected:', err);
      }
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }

    // Restore webcam track across peer devices
    if (localStreamRef.current) {
      const webcamTrack = localStreamRef.current.getVideoTracks()[0];
      (Object.values(pcs.current) as RTCPeerConnection[]).forEach(pc => {
        const senders = pc.getSenders();
        const sender = senders.find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(webcamTrack);
        }
      });
    }

    setScreenSharing(false);
  };

  // Settle connections cleanly
  const hangUpMeeting = (shouldResetInState = true) => {
    // 1. Stop all captured stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }

    // 2. Tear down RTC channels
    Object.keys(pcs.current).forEach(socketId => {
      pcs.current[socketId].close();
    });
    pcs.current = {};

    // 3. Disconnect Socket
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setLocalStream(null);
    setRemoteStreams({});
    setParticipants({});
    setScreenSharing(false);
    setAudioMuted(false);
    setVideoMuted(false);

    if (shouldResetInState) {
      setInMeeting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans select-none">
      
      {/* Upper Global Navigation Header */}
      <header className="h-16 bg-white border-b border-gray-100 px-6 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm tracking-wide shadow-xs">
            S
          </div>
          <div>
            <h1 className="text-sm font-black font-sans text-gray-900 tracking-tight leading-none">SyncSpace RTC</h1>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Conference & Sync Desk</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 border-r border-gray-100 pr-4">
            <span 
              className="w-2.5 h-2.5 rounded-full border-2 border-white/60 ring-2 ring-emerald-500/10"
              style={{ backgroundColor: user.avatarColor }}
            />
            <span className="text-xs font-bold text-gray-700">{user.username}</span>
          </div>
          <button
            onClick={onLogout}
            className="text-xs text-rose-600 hover:text-rose-800 font-bold cursor-pointer transition-colors"
          >
            Log Out
          </button>
        </div>
      </header>

      {/* Main Container Viewport */}
      <main className="flex-1 p-6 relative flex flex-col xl:h-[calc(100vh-64px)] overflow-hidden">
        {showDeviceSelection && (
          <DeviceSelection
            onDevicesSelected={onDevicesSelected}
            onCancel={() => setShowDeviceSelection(false)}
          />
        )}

        {!inMeeting ? (
          /* ================= SCREEN A: MEETING ENTRANCE & INSTRUCTIONS ================= */
          <div id="entrance-dashboard" className="grid grid-cols-1 lg:grid-cols-[420px_1fr] max-w-7xl mx-auto w-full gap-8 h-full items-start">
            
            {/* Left Box: Meeting room setup portal */}
            <div className="bg-white border border-gray-150 rounded-2xl p-8 shadow-xl space-y-6">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">Initiate Call</h2>
                <p className="text-xs text-gray-500 leading-relaxed font-medium">Create a secure conference room key, share it with teammates, and negotiate your WebRTC connection instantly.</p>
              </div>

              {/* Action Toggle buttons */}
              <button
                id="create-room-btn"
                onClick={handleRoomCreateInit}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 font-bold text-white text-sm rounded-xl shadow-lg shadow-indigo-1200 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Start Instant Meeting
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-150"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase font-bold text-gray-400">
                  <span className="bg-white px-3">Or join by Code</span>
                </div>
              </div>

              {/* Join Code Input Form */}
              <form onSubmit={handleRoomJoinInit} className="space-y-3">
                <div>
                  <input
                    id="join-code-input"
                    type="text"
                    placeholder="e.g. abc-123-xyz"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="w-full text-center tracking-wider uppercase font-mono px-4 py-3 bg-gray-50 border border-gray-250 rounded-xl text-gray-800 text-sm focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all"
                    required
                  />
                </div>
                <button
                  id="join-room-btn"
                  type="submit"
                  className="w-full py-3 bg-white border border-gray-250 hover:border-indigo-500 hover:text-indigo-600 font-bold text-gray-700 text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  Join Meeting Space <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-[11px] text-amber-900 leading-relaxed font-semibold flex gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <div>
                  <h4 className="font-bold">Sandbox Environment Notice</h4>
                  <p className="mt-0.5 text-amber-700">WebRTC coordinates media peer-to-peer. When testing other attendees inside sandbox browsers, verify both clients lease camera assets.</p>
                </div>
              </div>
            </div>

            {/* Right Box: Setup & How-to Tutorial Guide */}
            <div id="tutorial-guide" className="bg-white border border-gray-150 rounded-2xl shadow-xl flex flex-col h-full lg:h-[520px] overflow-hidden">
              
              {/* Tutorial Tabs Header */}
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-150 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-indigo-600">
                  <BookOpen className="w-4 h-4 text-indigo-500" />
                  <h3 className="font-bold text-gray-900 text-xs uppercase tracking-wider">RTC Platform Manual</h3>
                </div>

                {/* Tab selectors */}
                <div className="flex bg-gray-100/80 p-0.5 rounded-lg border border-gray-200">
                  <button
                    onClick={() => setGuideTab('intro')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${guideTab === 'intro' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    1. Architecture
                  </button>
                  <button
                    onClick={() => setGuideTab('setup')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${guideTab === 'setup' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    2. Local Setup
                  </button>
                  <button
                    onClick={() => setGuideTab('run')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${guideTab === 'run' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    3. Launching
                  </button>
                </div>
              </div>

              {/* Tab content bodies */}
              <div className="flex-1 p-6 overflow-y-auto space-y-4">
                {guideTab === 'intro' && (
                  <div className="space-y-4 text-xs text-gray-600 leading-relaxed font-sans">
                    <h4 className="text-sm font-bold text-gray-950 flex items-center gap-2">
                      <Compass className="w-4 h-4 text-indigo-500" /> Understanding WebRTC Mesh Calling
                    </h4>
                    <p>
                      <strong>WebRTC (Web Real-Time Communication)</strong> is a browser standard that facilitates direct, peer-to-peer transmission of webcam feeds, audio streams, and unstructured data streams (e.g., drawings and messages) without routing raw heavy media payloads through a central server.
                    </p>
                    <p>Our application uses a <strong>Multi-User Mesh Routing Architecture</strong>:</p>
                    <div className="p-4 bg-gray-50 border border-gray-150 rounded-xl space-y-2.5">
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                        <p><strong>Signaling Server Relay:</strong> Socket.io acts as a matchmaking signaling gateway, exchanging session parameters (SDP Offer and Answer handshakes and connection-route ICE Candidates) between callers.</p>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                        <p><strong>Direct Feed Slicing:</strong> Once signaling finishes, browsers route video and audio streams directly to each other via UDP securely encrypted in hardware using DTLS-SRTP protocols.</p>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                        <p><strong>Shared Boards:</strong> Drawings and files are routed synchronously via Socket.io. The Express backend cache ensures state remains the source of truth for newly joining peers.</p>
                      </div>
                    </div>
                  </div>
                )}

                {guideTab === 'setup' && (
                  <div className="space-y-4 text-xs text-gray-600 leading-relaxed">
                    <h4 className="text-sm font-bold text-gray-950 flex items-center gap-2">
                      <Laptop className="w-4 h-4 text-indigo-500" /> Downloading & Local Dependencies
                    </h4>
                    <p>To run this application locally outside of Google AI Studio (e.g., on your workstation), complete these steps:</p>
                    <div className="p-4 bg-gray-900 border border-neutral-800 text-neutral-300 rounded-xl font-mono space-y-2">
                      <p className="text-indigo-400 font-semibold mb-1"># 1. Download node & extract zip</p>
                      <p>cd syncspace-rtc</p>
                      <p className="text-indigo-400 font-semibold mt-3 mb-1"># 2. Install required software bundles</p>
                      <p>npm install</p>
                      <p className="text-gray-500 text-[11px] font-sans italic">Installs Express, Socket.io, React 19, Vite, and Esbuild.</p>
                    </div>
                    <p className="text-gray-500 font-medium">This application is entirely self-contained. There are no secondary external database downloads (like MySQL or Postgres) or API keys required to use authentication or WebSockets.</p>
                  </div>
                )}

                {guideTab === 'run' && (
                  <div className="space-y-4 text-xs text-gray-600 leading-relaxed">
                    <h4 className="text-sm font-bold text-gray-950 flex items-center gap-2">
                      <Keyboard className="w-4 h-4 text-indigo-500" /> CLI Execution Pipelines
                    </h4>
                    <p>Once you install the dependencies, use these standard terminal CLI scripts to run development or bundle your production release:</p>
                    <table className="w-full text-xs border border-gray-150 rounded-lg overflow-hidden">
                      <thead className="bg-gray-50 border-b border-gray-150 text-gray-700 font-bold">
                        <tr>
                          <th className="px-3 py-2 text-left">Command</th>
                          <th className="px-3 py-2 text-left">Purpose</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-150 text-gray-600 font-semibold">
                        <tr>
                          <td className="px-3 py-2.5 font-mono text-indigo-600">npm run dev</td>
                          <td className="px-3 py-2.5">Boots Express under <code className="bg-gray-100 p-0.5 rounded text-gray-800">tsx</code> on port 3000, linking Vite as responsive middleware.</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2.5 font-mono text-indigo-600">npm run build</td>
                          <td className="px-3 py-2.5">Compiles React static assets to <code className="bg-gray-100 p-0.5 rounded">dist/</code> and bundles server.ts to a single clean <code className="bg-gray-100 p-0.5 rounded">dist/server.cjs</code> file using Esbuild.</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2.5 font-mono text-indigo-600">npm run start</td>
                          <td className="px-3 py-2.5">Directly launches compiled, fast node production server from <code className="bg-gray-100 p-0.5 rounded">dist/server.cjs</code>.</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

          </div>
        ) : (
          /* ================= SCREEN B: IN-MEETING SESSION DISPLAY ================= */
          <div id="active-session-sandbox" className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6 flex-1 xl:max-h-[calc(100vh-130px)] min-h-0">
            
            {/* Visual conference core: Video streams OR whiteboard workspace */}
            <div className="flex flex-col h-full min-h-0 gap-4">
              
              {/* Feature Tab Switcher Bar */}
              <div className="flex items-center gap-2 border-b border-gray-200 pb-2 flex-shrink-0">
                <button
                  id="tab-webrtc-grid"
                  onClick={() => setActiveTab('video')}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'video' 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-1200' 
                      : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
                  }`}
                >
                  <Video className="w-4 h-4" /> Live Video Conference
                </button>
                <button
                  id="tab-whiteboard"
                  onClick={() => setActiveTab('whiteboard')}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'whiteboard' 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-1200' 
                      : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
                  }`}
                >
                  <Edit3 className="w-4 h-4" /> Collaborative Whiteboard
                </button>
              </div>

              {/* Workspace viewport panels */}
              <div className="flex-1 min-h-0">
                {activeTab === 'video' ? (
                  <VideoGrid
                    localStream={localStream}
                    remoteStreams={remoteStreams}
                    roomParticipants={participants}
                    localUser={user}
                    audioMuted={audioMuted}
                    videoMuted={videoMuted}
                    screenSharing={screenSharing}
                    onToggleAudio={toggleAudio}
                    onToggleVideo={toggleVideo}
                    onToggleScreen={toggleScreenShare}
                    onHangUp={() => hangUpMeeting(true)}
                  />
                ) : (
                  <Whiteboard
                    socket={socketRef.current}
                    roomId={roomId}
                    userId={user.id}
                    initialDrawings={initialDrawings}
                  />
                )}
              </div>
            </div>

            {/* Sidebar chat & file sharing panel */}
            <div className="h-[550px] xl:h-full min-h-0 flex-shrink-0">
              <ChatAndFiles
                socket={socketRef.current}
                roomId={roomId}
                user={user}
                initialMessages={initialMessages}
                participants={participants}
              />
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
