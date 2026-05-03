'use client';

import React, { useCallback, useRef, useState } from 'react';
import type { SongSection } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface SectionListProps {
  sections: SongSection[];
  onChange: (sections: SongSection[]) => void;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

const PRESETS: { label: string; name: string }[] = [
  { label: 'Intro', name: 'Intro' },
  { label: 'Verse', name: 'Verse' },
  { label: 'Chorus', name: 'Chorus' },
  { label: 'Bridge', name: 'Bridge' },
  { label: 'Outro', name: 'Outro' },
];

export function SectionList({ sections, onChange }: SectionListProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  const addSection = useCallback(
    (name: string = 'New Section', bars: number = 8) => {
      onChange([...sections, { id: generateId(), name, bars }]);
    },
    [sections, onChange],
  );

  const updateSection = useCallback(
    (index: number, update: Partial<SongSection>) => {
      const next = sections.map((s, i) => (i === index ? { ...s, ...update } : s));
      onChange(next);
    },
    [sections, onChange],
  );

  const removeSection = useCallback(
    (index: number) => {
      onChange(sections.filter((_, i) => i !== index));
    },
    [sections, onChange],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, index: number) => {
      setDragIndex(index);
      dragNodeRef.current = e.currentTarget;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
      requestAnimationFrame(() => {
        if (dragNodeRef.current) {
          dragNodeRef.current.style.opacity = '0.4';
        }
      });
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setOverIndex(index);
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === dropIndex) {
        setDragIndex(null);
        setOverIndex(null);
        return;
      }
      const reordered = [...sections];
      const [removed] = reordered.splice(dragIndex, 1);
      reordered.splice(dropIndex, 0, removed);
      onChange(reordered);
      setDragIndex(null);
      setOverIndex(null);
    },
    [dragIndex, sections, onChange],
  );

  const handleDragEnd = useCallback(() => {
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '1';
    }
    setDragIndex(null);
    setOverIndex(null);
    dragNodeRef.current = null;
  }, []);

  const totalBars = sections.reduce((sum, s) => sum + s.bars, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="label font-mono text-xs uppercase tracking-wider">
          Sections
        </label>
        {sections.length > 0 && (
          <span className="font-mono text-xs text-muted">
            {sections.length} section{sections.length !== 1 ? 's' : ''} / {totalBars} bars
          </span>
        )}
      </div>

      {/* Section items */}
      <div className="space-y-2">
        {sections.map((section, index) => (
          <div
            key={section.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={cn(
              'group flex items-center gap-3 rounded-lg border bg-surface-raised px-3 py-2.5 transition-colors',
              overIndex === index && dragIndex !== index
                ? 'border-accent/50 bg-accent/5'
                : 'border-surface-border',
              dragIndex === index && 'opacity-40',
            )}
          >
            {/* Drag handle */}
            <div className="flex cursor-grab items-center text-muted hover:text-[#F0EDE6] active:cursor-grabbing">
              <svg
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-label="Drag to reorder"
              >
                <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
              </svg>
            </div>

            {/* Section number */}
            <span className="font-mono text-xs text-muted w-5 text-center flex-shrink-0">
              {index + 1}
            </span>

            {/* Section name */}
            <input
              type="text"
              value={section.name}
              onChange={(e) => updateSection(index, { name: e.target.value })}
              className="input flex-1 min-w-0"
              placeholder="Section name"
              aria-label={`Section ${index + 1} name`}
            />

            {/* Bar count */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <input
                type="number"
                value={section.bars}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1 && val <= 99) {
                    updateSection(index, { bars: val });
                  }
                }}
                min={1}
                max={99}
                className="input w-16 text-center font-mono"
                aria-label={`Section ${index + 1} bar count`}
              />
              <span className="font-mono text-xs text-muted">bars</span>
            </div>

            {/* Delete button */}
            <button
              type="button"
              onClick={() => removeSection(index)}
              className="flex-shrink-0 rounded-md p-1.5 text-muted hover:bg-red-900/30 hover:text-red-400 transition-colors"
              aria-label={`Delete section ${section.name}`}
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {sections.length === 0 && (
        <div className="rounded-lg border border-dashed border-surface-border px-6 py-8 text-center">
          <p className="text-sm text-muted mb-3">
            No sections yet. Add sections to define your song structure.
          </p>
        </div>
      )}

      {/* Preset quick-add buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => addSection(preset.name, preset.name === 'Intro' || preset.name === 'Outro' ? 4 : 8)}
            className="inline-flex items-center gap-1 rounded-md border border-surface-border px-2.5 py-1 text-xs font-mono text-muted hover:border-accent/40 hover:text-accent transition-colors"
          >
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            {preset.label}
          </button>
        ))}
      </div>

      {/* Add custom section */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => addSection()}
        className="w-full"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
        </svg>
        Add Section
      </Button>
    </div>
  );
}
