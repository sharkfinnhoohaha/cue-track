'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { TrackRecord } from '@/types';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

export default function DashboardPage() {
  const [tracks, setTracks] = useState<TrackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/tracks');
        if (res.ok) {
          const data = await res.json();
          setTracks(data.tracks || []);
          setIsPro(data.isPro || false);
        }
      } catch {
        // Silently fail -- will show empty state
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-10">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-4xl font-semibold tracking-tight text-[#F0EDE6]">
                Your Tracks
              </h1>
              {isPro && (
                <span className="badge-accent font-mono text-xs uppercase">Pro</span>
              )}
            </div>
            <p className="mt-2 text-muted text-sm">
              {tracks.length > 0
                ? `${tracks.length} track${tracks.length !== 1 ? 's' : ''} generated`
                : 'Manage and download your click tracks'}
            </p>
          </div>
          <Link href="/create">
            <Button variant="primary" size="md">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
              New Track
            </Button>
          </Link>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="skeleton h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-5 w-48" />
                    <div className="skeleton h-3 w-32" />
                  </div>
                  <div className="skeleton h-8 w-20 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && tracks.length === 0 && (
          <Card className="py-8">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-border">
                <svg className="h-8 w-8 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                </svg>
              </div>
              <h2 className="font-display text-xl font-semibold text-[#F0EDE6] mb-2">
                No tracks yet
              </h2>
              <p className="text-sm text-muted mb-6 max-w-sm">
                Create your first click track. Define your song structure, choose your sounds,
                and generate a studio-quality track in seconds.
              </p>
              <Link href="/create">
                <Button variant="primary" size="md" className="glow-accent">
                  Create Your First Track
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {/* Track list */}
        {!loading && tracks.length > 0 && (
          <div className="space-y-3">
            {tracks.map((track) => {
              const sectionCount = track.spec.sections.length;
              const tsLabel = `${track.spec.timeSignature.beats}/${track.spec.timeSignature.subdivision}`;

              return (
                <Link
                  key={track.id}
                  href={`/tracks/${track.id}`}
                  className="group block"
                >
                  <div className="card p-4 sm:p-5 transition-all hover:border-accent/30 hover:bg-surface-raised/80">
                    <div className="flex items-center gap-4">
                      {/* Play icon */}
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-border group-hover:bg-accent/15 transition-colors">
                        <svg
                          className="h-4 w-4 text-muted group-hover:text-accent transition-colors ml-0.5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                        </svg>
                      </div>

                      {/* Track info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-[#F0EDE6] truncate group-hover:text-accent transition-colors">
                          {track.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                          <span className="font-mono text-xs text-muted">{track.spec.bpm} BPM</span>
                          <span className="font-mono text-xs text-muted">{tsLabel}</span>
                          <span className="font-mono text-xs text-muted">
                            {sectionCount} section{sectionCount !== 1 ? 's' : ''}
                          </span>
                          <span className="font-mono text-xs text-muted">
                            {formatDuration(track.duration)}
                          </span>
                        </div>
                      </div>

                      {/* Status & date */}
                      <div className="hidden sm:flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span
                          className={cn(
                            'badge',
                            track.status === 'ready' && 'badge-green',
                            track.status === 'rendering' && 'badge-accent',
                            track.status === 'failed' && 'badge-red',
                          )}
                        >
                          {track.status === 'ready' && 'Ready'}
                          {track.status === 'rendering' && 'Rendering'}
                          {track.status === 'failed' && 'Failed'}
                        </span>
                        <span className="text-xs text-muted">
                          {formatDate(track.createdAt)}
                        </span>
                      </div>

                      {/* Arrow */}
                      <svg
                        className="h-4 w-4 text-muted group-hover:text-accent transition-colors flex-shrink-0"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
