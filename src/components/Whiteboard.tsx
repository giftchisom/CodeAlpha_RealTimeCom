/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from 'react';
import { Stroke, Point } from '../types';
import { Socket } from 'socket.io-client';
import { Edit2, Eraser, Trash2, Download, Circle } from 'lucide-react';

interface WhiteboardProps {
  socket: Socket | null;
  roomId: string;
  userId: string;
  initialDrawings: Stroke[];
}

export default function Whiteboard({ socket, roomId, userId, initialDrawings }: WhiteboardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const currentStrokePointsRef = useRef<Point[]>([]);

  const [drawings, setDrawings] = useState<Stroke[]>(initialDrawings);
  const [color, setColor] = useState('#3b82f6'); // default indigo-blue
  const [width, setWidth] = useState(4);
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  // Sync initial drawings list when joining
  useEffect(() => {
    setDrawings(initialDrawings);
  }, [initialDrawings]);

  // Socket communication listeners for synced drawing strokes
  useEffect(() => {
    if (!socket) return;

    const handleStrokeReceived = (stroke: Stroke) => {
      setDrawings(prev => {
        // Prevent duplicate joins
        if (prev.some(s => s.id === stroke.id)) {
          return prev;
        }
        return [...prev, stroke];
      });
    };

    const handleDrawingsCleared = () => {
      setDrawings([]);
    };

    socket.on('stroke-received', handleStrokeReceived);
    socket.on('drawings-cleared', handleDrawingsCleared);

    return () => {
      socket.off('stroke-received', handleStrokeReceived);
      socket.off('drawings-cleared', handleDrawingsCleared);
    };
  }, [socket]);

  // Implement ResizeObserver to handle fluid responsive size of container
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        // Keep dimensions matched but bounded
        setDimensions({
          width: Math.floor(width) || 800,
          height: Math.floor(height) || 450,
        });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Whenever dimensions or drawings state modifies, redraw entire canvas
  useEffect(() => {
    drawCanvas();
  }, [dimensions, drawings]);

  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.points.length < 2) return;
    
    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const p0 = stroke.points[0];
    ctx.moveTo(p0.x, p0.y);

    for (let i = 1; i < stroke.points.length; i++) {
      const p = stroke.points[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear and draw grid background
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    // Subtle technical background grid dots
    ctx.fillStyle = '#e5e5e5';
    const gridSpacing = 24;
    for (let x = gridSpacing; x < dimensions.width; x += gridSpacing) {
      for (let y = gridSpacing; y < dimensions.height; y += gridSpacing) {
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }

    // Render historical synced strokes
    drawings.forEach(stroke => {
      drawStroke(ctx, stroke);
    });
  };

  // Capture canvas relative coordinates for mouse or touch events
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent | TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    
    // Support TouchEvents
    if ('touches' in e) {
      if (e.touches && e.touches.length > 0) {
        const touch = e.touches[0];
        return {
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top,
        };
      }
    }
    
    // Support MouseEvents
    const mouseEvent = e as React.MouseEvent;
    return {
      x: mouseEvent.clientX - rect.left,
      y: mouseEvent.clientY - rect.top,
    };
  };

  const handleStartDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const point = getCoordinates(e);
    isDrawingRef.current = true;
    currentStrokePointsRef.current = [point];

    // Simple single tap draw feed
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        ctx.fillStyle = tool === 'eraser' ? '#fafafa' : color;
        ctx.arc(point.x, point.y, width / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  const handleDrawingMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const point = getCoordinates(e);
    const lastPoint = currentStrokePointsRef.current[currentStrokePointsRef.current.length - 1];

    ctx.beginPath();
    ctx.strokeStyle = tool === 'eraser' ? '#fafafa' : color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    currentStrokePointsRef.current.push(point);
  };

  const handleStopDraw = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (currentStrokePointsRef.current.length < 2) return;

    const newStroke: Stroke = {
      id: Math.random().toString(36).substring(2, 9),
      userId,
      color: tool === 'eraser' ? '#fafafa' : color,
      width,
      points: [...currentStrokePointsRef.current],
      isComplete: true,
    };

    setDrawings(prev => [...prev, newStroke]);

    // Send completed vectors over socket
    if (socket) {
      socket.emit('draw-stroke', { stroke: newStroke });
    }

    currentStrokePointsRef.current = [];
  };

  const handleClear = () => {
    if (window.confirm('Are you sure you want to clear the whiteboard for all participants?')) {
      setDrawings([]);
      if (socket) {
        socket.emit('clear-drawings');
      }
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = `whiteboard-${roomId}-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div id="whiteboard-module" className="flex flex-col h-full bg-white border border-gray-150 rounded-2xl overflow-hidden shadow-xs">
      
      {/* Tool Header Menu */}
      <div className="flex flex-wrap items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-150 gap-2">
        <div className="flex items-center gap-2">
          {/* Brush button */}
          <button
            id="wb-tool-brush"
            onClick={() => setTool('brush')}
            className={`p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center ${tool === 'brush' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-1200' : 'bg-white hover:bg-gray-100 border border-gray-200 text-gray-700'}`}
            title="Brush Tool"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          
          {/* Eraser button */}
          <button
            id="wb-tool-eraser"
            onClick={() => setTool('eraser')}
            className={`p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center ${tool === 'eraser' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-1200' : 'bg-white hover:bg-gray-100 border border-gray-200 text-gray-700'}`}
            title="Eraser Tool"
          >
            <Eraser className="w-4 h-4" />
          </button>

          <span className="h-6 w-px bg-gray-200 mx-1"></span>

          {/* Color Palletes */}
          {tool === 'brush' && (
            <div className="flex items-center gap-1.5 list-none">
              {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#1e293b', '#8b5cf6'].map(paletteColor => (
                <button
                  key={paletteColor}
                  onClick={() => setColor(paletteColor)}
                  style={{ backgroundColor: paletteColor }}
                  className={`w-6 h-6 rounded-full border border-offset-2 flex items-center justify-center transition-all scale-95 hover:scale-105 active:scale-95 cursor-pointer`}
                  title={paletteColor}
                >
                  {color === paletteColor && (
                    <div className="w-2 h-2 rounded-full bg-white opacity-80" />
                  )}
                </button>
              ))}
            </div>
          )}

          {tool === 'eraser' && (
            <span className="text-xs font-semibold text-gray-500 italic bg-gray-100 px-2 py-1 rounded-md">
              Eraser active
            </span>
          )}

          <span className="h-6 w-px bg-gray-200 mx-1"></span>

          {/* Width Selector */}
          <div className="flex items-center gap-1 shadow-inner bg-gray-100/60 border border-gray-200 rounded-lg p-0.5">
            {[2, 4, 8, 12].map(px => (
              <button
                key={px}
                onClick={() => setWidth(px)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition-colors ${width === px ? 'bg-white text-gray-950 shadow-xs' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {px}px
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Download button */}
          <button
            id="wb-action-download"
            onClick={handleDownload}
            className="p-2 bg-white hover:bg-gray-150 border border-gray-200 text-gray-700 rounded-xl transition-all cursor-pointer flex items-center justify-center shadow-xs"
            title="Download Whiteboard Drawing"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Clear button */}
          <button
            id="wb-action-clear"
            onClick={handleClear}
            className="p-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-xl transition-all cursor-pointer flex items-center justify-center flex-shrink-0"
            title="Clear canvas for all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Drawing Canvas Board */}
      <div
        id="whiteboard-canvas-container"
        ref={containerRef}
        className="flex-1 min-h-[300px] relative overflow-hidden bg-neutral-50 touch-none select-none cursor-crosshair"
      >
        <canvas
          id="sketch-canvas-element"
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          onMouseDown={handleStartDraw}
          onMouseMove={handleDrawingMove}
          onMouseUp={handleStopDraw}
          onMouseLeave={handleStopDraw}
          onTouchStart={handleStartDraw}
          onTouchMove={handleDrawingMove}
          onTouchEnd={handleStopDraw}
          className="absolute inset-0 block"
        />
      </div>

    </div>
  );
}
