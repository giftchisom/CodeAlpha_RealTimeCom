/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { Camera, Mic, MicOff, Video, VideoOff, Settings, CheckCircle } from 'lucide-react';

interface DeviceSelectionProps {
  onDevicesSelected: (constraints: MediaStreamConstraints, audioDeviceId: string, videoDeviceId: string) => void;
  onCancel: () => void;
}

export default function DeviceSelection({ onDevicesSelected, onCancel }: DeviceSelectionProps) {
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [selectedAudioId, setSelectedAudioId] = useState('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  // Request initial hardware permissions and list active devices
  const requestPermissions = async () => {
    try {
      setErrorMsg('');
      const initialStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(initialStream);
      setPermissionGranted(true);
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoIns = devices.filter(d => d.kind === 'videoinput');
      const audioIns = devices.filter(d => d.kind === 'audioinput');
      
      setVideoDevices(videoIns);
      setAudioDevices(audioIns);

      if (videoIns.length > 0) setSelectedVideoId(videoIns[0].deviceId);
      if (audioIns.length > 0) setSelectedAudioId(audioIns[0].deviceId);

    } catch (err: any) {
      console.error('Device access denied:', err);
      setErrorMsg('Permission to access Camera and Microphone was denied or no media devices found. Please enable permission in your browser or connect gear.');
    }
  };

  useEffect(() => {
    requestPermissions();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Update preview feed when active device selection cycles
  useEffect(() => {
    if (!permissionGranted) return;

    const loadNewPreview = async () => {
      // Clear current tracks
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      try {
        const constraints: MediaStreamConstraints = {
          audio: selectedAudioId ? { deviceId: { exact: selectedAudioId } } : true,
          video: selectedVideoId ? { deviceId: { exact: selectedVideoId } } : true
        };

        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Apply local UI muting toggles to preview track
        newStream.getAudioTracks().forEach(t => t.enabled = !audioMuted);
        newStream.getVideoTracks().forEach(t => t.enabled = !videoMuted);

        setStream(newStream);
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = newStream;
        }
      } catch (err) {
        console.error('Error changing preview devices:', err);
      }
    };

    loadNewPreview();
  }, [selectedVideoId, selectedAudioId]);

  // Handle local webcam and mic toggles before joining the room
  const toggleAudio = () => {
    if (stream) {
      const state = !audioMuted;
      stream.getAudioTracks().forEach(t => t.enabled = !state);
      setAudioMuted(state);
    }
  };

  const toggleVideo = () => {
    if (stream) {
      const state = !videoMuted;
      stream.getVideoTracks().forEach(t => t.enabled = !state);
      setVideoMuted(state);
    }
  };

  const handleJoin = () => {
    if (stream) {
      // Pass the fully working configurations
      const currentConstraints: MediaStreamConstraints = {
        audio: selectedAudioId ? { deviceId: { exact: selectedAudioId } } : true,
        video: selectedVideoId ? { deviceId: { exact: selectedVideoId } } : true
      };
      
      // Stop current preview so meeting component can lease hardware afresh
      stream.getTracks().forEach(track => track.stop());
      onDevicesSelected(currentConstraints, selectedAudioId, selectedVideoId);
    } else {
      // Fallback
      onDevicesSelected({ video: true, audio: true }, '', '');
    }
  };

  return (
    <div id="device-selection-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
      <div id="device-card" className="w-full max-w-2xl bg-white border border-gray-150 shadow-2xl rounded-2xl overflow-hidden flex flex-col md:flex-row h-auto md:h-[520px]">
        
        {/* Left Side: Real-time Camera Preview Frame */}
        <div className="flex-1 bg-neutral-900 relative flex items-center justify-center min-h-[240px] md:min-h-0">
          {permissionGranted && !videoMuted ? (
            <video
              id="device-video-preview"
              ref={videoPreviewRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-neutral-950 flex flex-col items-center justify-center text-gray-500 gap-3">
              <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center text-rose-500">
                <VideoOff className="w-8 h-8" />
              </div>
              <p className="text-sm font-medium text-gray-400">Webcam turned off</p>
            </div>
          )}

          {/* Floating Device Controls (Webcam, Mic status) */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-neutral-900/80 backdrop-blur px-4 py-2 rounded-full border border-neutral-700/50">
            <button
              id="preview-toggle-audio-btn"
              onClick={toggleAudio}
              className={`p-2.5 rounded-full transition-colors cursor-pointer ${audioMuted ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-neutral-800 text-gray-300 hover:bg-neutral-700'}`}
              title={audioMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {audioMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              id="preview-toggle-video-btn"
              onClick={toggleVideo}
              className={`p-2.5 rounded-full transition-colors cursor-pointer ${videoMuted ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-neutral-800 text-gray-300 hover:bg-neutral-700'}`}
              title={videoMuted ? 'Turn on camera' : 'Turn off camera'}
            >
              {videoMuted ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Right Side: Settings & Selection list */}
        <div className="w-full md:w-[280px] p-6 flex flex-col justify-between border-t md:border-t-0 md:border-l border-gray-100 bg-gray-50/50">
          <div className="space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-150">
              <Settings className="w-4 h-4 text-indigo-500" />
              <h3 className="font-bold text-gray-950 text-sm">Media Configuration</h3>
            </div>

            {errorMsg ? (
              <div className="text-xs text-rose-600 space-y-3">
                <p>{errorMsg}</p>
                <button
                  onClick={requestPermissions}
                  className="px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 text-xs font-semibold rounded-lg cursor-pointer hover:bg-indigo-100 transition-colors"
                >
                  Grant Input Access
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Camera Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-indigo-500" /> Camera Source
                  </label>
                  <select
                    id="video-device-select"
                    value={selectedVideoId}
                    onChange={(e) => setSelectedVideoId(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    {videoDevices.map(device => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Camera ${videoDevices.indexOf(device) + 1}`}
                      </option>
                    ))}
                    {videoDevices.length === 0 && <option value="">Loading camera...</option>}
                  </select>
                </div>

                {/* Microphone Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5 text-indigo-500" /> Mic Source
                  </label>
                  <select
                    id="audio-device-select"
                    value={selectedAudioId}
                    onChange={(e) => setSelectedAudioId(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    {audioDevices.map(device => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone ${audioDevices.indexOf(device) + 1}`}
                      </option>
                    ))}
                    {audioDevices.length === 0 && <option value="">Loading microphone...</option>}
                  </select>
                </div>

                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex gap-2 items-start mt-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-emerald-800 leading-relaxed font-medium">
                    Gear active. Camera track will be served secured via WebRTC DTLS.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2.5 pt-6 mt-4 border-t border-gray-150">
            <button
              id="cancel-device-select-btn"
              onClick={onCancel}
              className="flex-1 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-250 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="confirm-device-select-btn"
              disabled={!permissionGranted}
              onClick={handleJoin}
              className="flex-1 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-indigo-1200 rounded-xl transition-all cursor-pointer"
            >
              Confirm & Enter
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
