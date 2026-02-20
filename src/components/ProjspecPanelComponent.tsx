import React, { useEffect, useRef, useCallback } from 'react';
import {
  IProject,
  IScanResponse,
  ScanSource,
  formatScanSource,
  buildScanEndpoint,
  buildScanInit,
  scanSourceKey
} from '../types';
import { ProjectView } from './ProjectView';
import { requestAPI } from '../request';

const DEBOUNCE_DELAY = 300;

interface IPanelState {
  loading: boolean;
  error: string | null;
  project: IProject | null;
}

interface IProjspecPanelComponentProps {
  scanSource: ScanSource | null;
  expandedSpecName?: string | null;
  expandRequestId?: number;
}

function LoadingSpinner(): React.ReactElement {
  return (
    <div className="jp-projspec-loading">
      <div className="jp-projspec-spinner" />
      <span>Scanning directory...</span>
    </div>
  );
}

function ErrorDisplay({ message }: { message: string }): React.ReactElement {
  return (
    <div className="jp-projspec-error">
      <span className="jp-projspec-error-icon">⚠</span>
      <span>{message}</span>
    </div>
  );
}

/**
 * Make commands only work with local paths; for jfs sources we return
 * null so the make buttons are hidden in the UI.
 */
function pathForMake(source: ScanSource): string | null {
  return source.type === 'local' ? source.path : null;
}

/**
 * Main panel component that renders projspec data.
 * Supports local paths and jupyter-fs URLs via the ScanSource prop.
 * When scanSource is null the panel shows a spinner without issuing a scan.
 */
export function ProjspecPanelComponent({
  scanSource,
  expandedSpecName,
  expandRequestId
}: IProjspecPanelComponentProps): React.ReactElement {
  const [state, setState] = React.useState<IPanelState>({
    loading: false,
    error: null,
    project: null
  });

  const currentSourceKeyRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scanDirectory = useCallback(async (source: ScanSource) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const key = scanSourceKey(source);

    try {
      const response = await requestAPI<IScanResponse>(
        buildScanEndpoint(source),
        buildScanInit(source, { signal: controller.signal })
      );

      if (key !== currentSourceKeyRef.current) {
        return;
      }

      if (!response) {
        setState({
          loading: false,
          error: 'Empty response from server',
          project: null
        });
      } else if (response.error) {
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
      if (key !== currentSourceKeyRef.current) {
        return;
      }

      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      let message = 'Unknown error occurred';
      if (err instanceof Error) {
        message = err.message;

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

  const sourceKey = scanSourceKey(scanSource);

  useEffect(() => {
    if (scanSource === null) {
      return;
    }

    currentSourceKeyRef.current = sourceKey;
    setState(prev => ({ ...prev, loading: true }));

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const source = scanSource;
    debounceTimerRef.current = setTimeout(() => {
      scanDirectory(source);
    }, DEBOUNCE_DELAY);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [sourceKey, scanDirectory]);

  if (scanSource === null) {
    return (
      <div className="jp-projspec-panel-content">
        <div className="jp-projspec-header">Project Spec</div>
        <div className="jp-projspec-empty-state">
          Open a file browser to see project specs.
        </div>
      </div>
    );
  }

  return (
    <div className="jp-projspec-panel-content">
      <div className="jp-projspec-header">Project Spec</div>
      <div className="jp-projspec-path">{formatScanSource(scanSource)}</div>

      {state.loading && <LoadingSpinner />}

      {!state.loading && state.error && <ErrorDisplay message={state.error} />}

      {!state.loading && !state.error && state.project && (
        <ProjectView
          project={state.project}
          path={pathForMake(scanSource)}
          expandedSpecName={expandedSpecName}
          expandRequestId={expandRequestId}
        />
      )}
    </div>
  );
}
