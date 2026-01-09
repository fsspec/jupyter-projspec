import React, { useEffect, useRef, useCallback } from 'react';
import { IProject, IScanResponse } from '../types';
import { ProjectView } from './ProjectView';
import { requestAPI } from '../request';

/**
 * Debounce delay in milliseconds.
 */
const DEBOUNCE_DELAY = 300;

/**
 * State for the panel component.
 */
interface IPanelState {
  loading: boolean;
  error: string | null;
  project: IProject | null;
}

/**
 * Props for the ProjspecPanelComponent.
 */
interface IProjspecPanelComponentProps {
  path: string;
}

/**
 * Format the display path.
 */
function formatPath(path: string): string {
  return path === '' || path === '/' ? '/ (root)' : path;
}

/**
 * Loading spinner component.
 */
function LoadingSpinner(): React.ReactElement {
  return (
    <div className="jp-projspec-loading">
      <div className="jp-projspec-spinner" />
      <span>Scanning directory...</span>
    </div>
  );
}

/**
 * Error display component.
 */
function ErrorDisplay({ message }: { message: string }): React.ReactElement {
  return (
    <div className="jp-projspec-error">
      <span className="jp-projspec-error-icon">⚠</span>
      <span>{message}</span>
    </div>
  );
}

/**
 * Main panel component that renders projspec data using React.
 */
export function ProjspecPanelComponent({
  path
}: IProjspecPanelComponentProps): React.ReactElement {
  const [state, setState] = React.useState<IPanelState>({
    loading: true,
    error: null,
    project: null
  });

  // Keep track of the current path for comparison
  const currentPathRef = useRef(path);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scan directory function
  const scanDirectory = useCallback(async (scanPath: string) => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create a new abort controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await requestAPI<IScanResponse>(
        `scan?path=${encodeURIComponent(scanPath)}`,
        {
          method: 'GET',
          signal: controller.signal
        }
      );

      // Check if this is still the current path
      if (scanPath !== currentPathRef.current) {
        return;
      }

      if (response.error) {
        setState({
          loading: false,
          error: response.error,
          project: null
        });
      } else if (response.project) {
        setState({
          loading: false,
          error: null,
          project: response.project
        });
      } else {
        setState({
          loading: false,
          error: 'Unexpected response from server',
          project: null
        });
      }
    } catch (err: unknown) {
      // Check if this is still the current path
      if (scanPath !== currentPathRef.current) {
        return;
      }

      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      // Extract error message
      let message = 'Unknown error occurred';
      if (err instanceof Error) {
        message = err.message;

        // Try to parse error details from the response
        const match = message.match(/API request failed \(\d+\): (.+)/);
        if (match) {
          try {
            const parsed = JSON.parse(match[1]);
            if (parsed.error) {
              message = parsed.error;
            }
          } catch {
            // Keep original message if not JSON
          }
        }
      }

      setState({
        loading: false,
        error: message,
        project: null
      });
    }
  }, []);

  // Effect to handle path changes with debouncing
  useEffect(() => {
    currentPathRef.current = path;

    // Show loading state immediately
    setState(prev => ({ ...prev, loading: true }));

    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the scan request
    debounceTimerRef.current = setTimeout(() => {
      scanDirectory(path);
    }, DEBOUNCE_DELAY);

    // Cleanup on unmount or path change
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [path, scanDirectory]);

  return (
    <div className="jp-projspec-panel-content">
      <div className="jp-projspec-header">Project Spec</div>
      <div className="jp-projspec-path">{formatPath(path)}</div>

      {state.loading && <LoadingSpinner />}

      {!state.loading && state.error && <ErrorDisplay message={state.error} />}

      {!state.loading && !state.error && state.project && (
        <ProjectView project={state.project} />
      )}
    </div>
  );
}

