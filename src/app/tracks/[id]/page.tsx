'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { TrackRecord } from '@/types';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

// ---------- Waveform Visualization ----------

function WaveformCanvas({
  audioUrl,
  currentTime,
  duration,
  onSeek,
}: {
  audioUrl: string;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveDataRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    if (!audioUrl) return;
    let cancelled = false;

    const loadWaveform = async () => {
      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const channelData = audioBuffer.getChannelData(0);

        const barCount = 200;
        const samplesPerBar = Math.floor(channelData.length / barCount);
        const peaks = new Float32Array(barCount);

        for (let i = 0; i < barCount; i++) {
          let max = 0;
          const start = i * samplesPerBar;
          const end = Math.min(start + samplesPerBar, channelData.length);
          for (let j = start; j < end; j++) {
            const abs = Math.abs(channelData[j]);
            if (abs > max) max = abs;
          }
          peaks[i] = max;
        }

        if (!cancelled) {
          waveDataRef.current = peaks;
        }
        audioContext.close();
      } catch {
        if (!cancelled) {
          const placeholder = new Float32Array(200);
          for (let i = 0; i < 200; i++) {
            placeholder[i] = 0.2 + Math.random() * 0.6;
          }
          waveDataRef.current = placeholder;
        }
      }
    };

    loadWaveform();
    return () => { cancelled = true; };
  }, [audioUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const peaks = waveDataRef.current;
    if (!canvas || !peaks) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const barCount = peaks.length;
    const barWidth = w / barCount;
    const gap = 1;
    const progress = duration > 0 ? currentTime / duration : 0;

    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < barCount; i++) {
      const x = i * barWidth;
      const barH = Math.max(2, peaks[i] * h * 0.85);
      const y = (h - barH) / 2;
      const isPlayed = i / barCount <= progress;

      ctx.fillStyle = isPlayed ? '#C8A250' : '#2A2A2A';
      ctx.fillRect(x + gap / 2, y, Math.max(1, barWidth - gap), barH);
    }
  }, [currentTime, duration]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || duration <= 0) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = x / rect.width;
      onSeek(ratio * duration);
    },
    [duration, onSeek],
  );

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="waveform-container h-24 w-full cursor-pointer"
      aria-label="Audio waveform. Click to seek."
    />
  );
}

// ---------- Audio Player ----------

function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnded);
    };
  }, [src]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); } else { audio.play(); }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-3">
      <audio ref={audioRef} src={src} preload="metadata" />
      <WaveformCanvas audioUrl={src} currentTime={currentTime} duration={duration} onSeek={seek} />
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={togglePlay}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-surface hover:bg-accent-300 transition-colors"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
            </svg>
          ) : (
            <svg className="h-5 w-5 ml-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
          )}
        </button>
        <div className="flex items-center gap-2 font-mono text-xs text-muted">
          <span>{formatTime(currentTime)}</span>
          <span>/</span>
          <span>{formatTime(duration)}</span>
        </div>
        <div className="flex-1">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Track Detail Page ----------

export default function TrackDetailPage() {
  const params = useParams();
  const trackId = params.id as string;
  const [track, setTrack] = useState<TrackRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const fetchTrack = async () => {
      try {
        const res = await fetch(`/api/tracks/${trackId}`);
        if (!res.ok) throw new Error('Track not found');
        const data = await res.json();
        setTrack(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load track');
      } finally {
        setLoading(false);
      }
    };
    fetchTrack();
  }, [trackId]);

  const handleCheckout = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/tracks/${trackId}/checkout`, { method: 'POST' });
      if (!res.ok) throw new Error('Checkout failed');
      const data = await res.json();
      if (data.url) { window.location.href = data.url; }
    } catch {
      setError('Failed to start checkout. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/tracks/${trackId}/download`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${track?.title || 'track'}.${track?.spec.format || 'wav'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-28 pb-20">
          <div className="space-y-6 animate-pulse">
            <div className="skeleton h-10 w-72" />
            <div className="skeleton h-6 w-48" />
            <div className="skeleton h-24 w-full rounded-lg" />
          </div>
        </main>
      </>
    );
  }

  if (error || !track) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-28 pb-20">
          <div className="text-center py-20">
            <h1 className="font-display text-3xl font-semibold text-[#F0EDE6] mb-3">Track Not Found</h1>
            <p className="text-muted mb-6">{error || 'The track you are looking for does not exist.'}</p>
            <a href="/create"><Button variant="primary">Create a New Track</Button></a>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const totalBars = track.spec.sections.reduce((sum, s) => sum + s.bars, 0);
  const tsLabel = `${track.spec.timeSignature.beats}/${track.spec.timeSignature.subdivision}`;
  const createdDate = new Date(track.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const isPaid = track.fullUrl !== null;
  const isRendering = track.status === 'rendering';

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className={cn('badge', track.status === 'ready' && 'badge-green', track.status === 'rendering' && 'badge-accent', track.status === 'failed' && 'badge-red')}>
              {track.status === 'ready' && 'Ready'}
              {track.status === 'rendering' && 'Rendering...'}
              {track.status === 'failed' && 'Failed'}
            </span>
            <span className="badge badge-muted font-mono uppercase">{track.spec.format}</span>
          </div>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-[#F0EDE6] sm:text-5xl">{track.title}</h1>
          <p className="mt-2 text-sm text-muted">Created {createdDate}</p>
        </div>

        {track.previewUrl && track.status === 'ready' && (
          <Card className="mb-8"><AudioPlayer src={track.previewUrl} /></Card>
        )}

        {isRendering && (
          <Card className="mb-8">
            <div className="flex flex-col items-center py-8 text-center">
              <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-surface-border border-t-accent" />
              <p className="text-sm text-[#F0EDE6] font-medium">Generating your track...</p>
              <p className="text-xs text-muted mt-1">This usually takes a few seconds.</p>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
          <Card><div className="text-center"><p className="font-mono text-xs uppercase text-muted tracking-wider">BPM</p><p className="font-mono text-2xl font-bold text-[#F0EDE6] mt-1">{track.spec.bpm}</p></div></Card>
          <Card><div className="text-center"><p className="font-mono text-xs uppercase text-muted tracking-wider">Time Sig</p><p className="font-mono text-2xl font-bold text-[#F0EDE6] mt-1">{tsLabel}</p></div></Card>
          <Card><div className="text-center"><p className="font-mono text-xs uppercase text-muted tracking-wider">Sections</p><p className="font-mono text-2xl font-bold text-[#F0EDE6] mt-1">{track.spec.sections.length}</p></div></Card>
          <Card><div className="text-center"><p className="font-mono text-xs uppercase text-muted tracking-wider">Duration</p><p className="font-mono text-2xl font-bold text-[#F0EDE6] mt-1">{track.duration ? `${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, '0')}` : '--:--'}</p></div></Card>
        </div>

        <Card header="Section Breakdown" className="mb-8">
          <div className="space-y-2">
            {track.spec.sections.map((section, i) => (
              <div key={section.id || i} className="flex items-center justify-between rounded-lg bg-surface px-4 py-2.5 border border-surface-border">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted w-6 text-center">{i + 1}</span>
                  <span className="text-sm font-medium text-[#F0EDE6]">{section.name}</span>
                </div>
                <span className="font-mono text-xs text-muted">{section.bars} bars</span>
              </div>
            ))}
            <div className="flex justify-end pt-2 border-t border-surface-border mt-3">
              <span className="font-mono text-xs text-muted">Total: {totalBars} bars</span>
            </div>
          </div>
        </Card>

        {track.status === 'ready' && (
          <div className="flex flex-col items-center gap-3 pt-4">
            {isPaid ? (
              <Button variant="primary" size="lg" onClick={handleDownload} loading={downloading} className="min-w-[240px] glow-accent">
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                  <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                </svg>
                Download Full Track
              </Button>
            ) : (
              <Button variant="primary" size="lg" onClick={handleCheckout} loading={downloading} className="min-w-[240px] glow-accent">
                Download Full Track &mdash; $3
              </Button>
            )}
            <p className="text-xs text-muted">{isPaid ? `${track.spec.format.toUpperCase()} file, studio quality` : 'One-time payment. No subscription required.'}</p>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
