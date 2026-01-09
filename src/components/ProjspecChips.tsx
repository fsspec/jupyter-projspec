import React, { useEffect, useState, useRef, useCallback } from 'react';
import { requestAPI } from '../request';
import { IScanResponse } from '../types';
import {
  getSpecInfo,
  getTextColorForBackground
} from '../specInfo';

/**
 * Debounce delay for API requests in milliseconds.
 */
const DEBOUNCE_DELAY = 200;

/**
 * Props for the ProjspecChips component.
 */
interface IProjspecChipsProps {
  /** Current path in the file browser. */
  path: string;
  /** Callback when a chip is clicked. */
  onChipClick: (specName: string) => void;
  /** Callback when visibility should change (has specs vs no specs). */
  onVisibilityChange?: (visible: boolean) => void;
}

/**
 * Component that renders projspec type chips in the file browser.
 * Shows colored badges for each detected project type.
 */
export function ProjspecChips({
  path,
  onChipClick,
  onVisibilityChange
}: IProjspecChipsProps): React.ReactElement {
  const [specs, setSpecs] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevVisibleRef = useRef<boolean | null>(null);

  const fetchSpecs = useCallback(async (scanPath: string) => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError(false);

    try {
      const response = await requestAPI<IScanResponse>(
        `scan?path=${encodeURIComponent(scanPath)}`,
        {
          method: 'GET',
          signal: controller.signal
        }
      );

      if (response.project?.specs) {
        setSpecs(Object.keys(response.project.specs));
      } else {
        setSpecs([]);
      }
    } catch (err: unknown) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      console.warn('Projspec chips: failed to fetch specs', err);
      setSpecs([]);
      setError(true);
    }
  }, []);

  useEffect(() => {
    // Clear specs immediately on path change to avoid showing stale data
    setSpecs([]);

    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the API request
    debounceTimerRef.current = setTimeout(() => {
      fetchSpecs(path);
    }, DEBOUNCE_DELAY);

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [path, fetchSpecs]);

  // Notify parent of visibility changes
  useEffect(() => {
    const shouldBeVisible = specs.length > 0;
    if (prevVisibleRef.current !== shouldBeVisible) {
      prevVisibleRef.current = shouldBeVisible;
      onVisibilityChange?.(shouldBeVisible);
    }
  }, [specs.length, onVisibilityChange]);

  // Calculate visibility - only show when we have specs
  const shouldShow = specs.length > 0;
  const hasError = error && specs.length === 0;

  // Don't render content if hidden, loading, or error
  if (!shouldShow || hasError) {
    return <div className="jp-projspec-chips jp-projspec-chips-hidden" />;
  }

  return (
    <div className="jp-projspec-chips">
      {specs.map(specName => {
          const info = getSpecInfo(specName);
          const textColor = getTextColorForBackground(info.color);

          return (
            <button
              key={specName}
              className="jp-projspec-chip"
              style={{
                backgroundColor: info.color,
                color: textColor,
                borderRadius: '999px',
                padding: '6px 16px 6px 12px'
              }}
              title={`${info.displayName} - Click to view details`}
              onClick={() => onChipClick(specName)}
            >
              <span className="jp-projspec-chip-icon">{info.icon}</span>
              <span className="jp-projspec-chip-label">{info.displayName}</span>
            </button>
          );
        })}
    </div>
  );
}

