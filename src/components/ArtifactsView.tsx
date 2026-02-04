import React, { useState } from 'react';
import { IArtifact } from '../types';
import { make } from '../api';

/**
 * Props for the ArtifactsView component.
 */
interface IArtifactsViewProps {
  artifacts: Record<string, IArtifact | string>;
}

/**
 * Parse a compact artifact string into parts.
 * Format: "command args, status" -> { cmd: "command args", status: "status" }
 */
function parseCompactArtifact(value: string): { cmd: string; status: string } {
  const lastComma = value.lastIndexOf(',');
  if (lastComma === -1) {
    return { cmd: value, status: '' };
  }
  return {
    cmd: value.substring(0, lastComma).trim(),
    status: value.substring(lastComma + 1).trim()
  };
}

/**
 * Props for a single artifact item (string form).
 */
interface IStringArtifactItemProps {
  name: string;
  artifact: string;
}

/**
 * Component for rendering a string artifact (compact mode from projspec).
 * Format: "command args, status"
 */
function StringArtifactItem({
  name,
  artifact
}: IStringArtifactItemProps): React.ReactElement {
  const { cmd, status } = parseCompactArtifact(artifact);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleMake = async () => {
    setIsRunning(true);
    setResult(null);

    try {
      const response = await make(cmd);
      console.log('Backend response:', response);

      if (response.returncode === 0) {
        const output = response.stdout.trim();
        setResult(output ? `Success\n${output}` : 'Success');
      } else {
        setResult(`Failed: ${response.stderr}`);
      }
    } catch (error: any) {
      const errorMsg = error?.message || error?.toString() || 'Unknown error';
      setResult(`Error: ${errorMsg}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="jp-projspec-artifact-item jp-projspec-artifact-string">
      <div className="jp-projspec-artifact-header">
        <span className="jp-projspec-artifact-icon">📦</span>
        <span className="jp-projspec-artifact-name">{name}</span>
        {status && (
          <span
            className={`jp-projspec-artifact-status jp-projspec-status-${status}`}
          >
            {status}
          </span>
        )}
        <button
          onClick={handleMake}
          disabled={isRunning}
          className="jp-projspec-make-button"
        >
          {isRunning ? '⏳ Running...' : '▶️ Make'}
        </button>
      </div>
      <code className="jp-projspec-artifact-cmd">{cmd}</code>
      {result && (
        <details>
          <summary>
            {result.startsWith('Success') ? '✅ Success' : '❌ Failed'} (click
            for details)
          </summary>
          <pre className="jp-projspec-result-output">{result}</pre>
        </details>
      )}
    </div>
  );
}

/**
 * Props for a single artifact item (object form).
 */
interface IObjectArtifactItemProps {
  name: string;
  artifact: IArtifact;
}

/**
 * Component for rendering an object artifact (non-compact mode).
 */
function ObjectArtifactItem({
  name,
  artifact
}: IObjectArtifactItemProps): React.ReactElement {
  // Filter out empty or internal fields
  const displayFields = Object.entries(artifact).filter(
    ([key, value]) =>
      !key.startsWith('_') &&
      value !== null &&
      value !== undefined &&
      value !== ''
  );

  return (
    <details className="jp-projspec-artifact-item">
      <summary className="jp-projspec-artifact-name">
        <span className="jp-projspec-artifact-icon">📦</span>
        {name}
        {artifact.status && (
          <span
            className={`jp-projspec-artifact-status jp-projspec-status-${artifact.status}`}
          >
            {artifact.status}
          </span>
        )}
      </summary>
      <div className="jp-projspec-artifact-details">
        {displayFields.length > 0 ? (
          <dl className="jp-projspec-artifact-fields">
            {displayFields.map(([key, value]) => {
              // Skip status since we show it in the summary
              if (key === 'status') {
                return null;
              }
              return (
                <div key={key} className="jp-projspec-artifact-field">
                  <dt>{key}</dt>
                  <dd>
                    {typeof value === 'object' ? (
                      <code>{JSON.stringify(value, null, 2)}</code>
                    ) : (
                      <code>{String(value)}</code>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : (
          <div className="jp-projspec-artifact-no-details">
            No additional details
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * Component for rendering the artifacts of a spec.
 * Handles both string artifacts (compact mode) and object artifacts.
 */
export function ArtifactsView({
  artifacts
}: IArtifactsViewProps): React.ReactElement {
  const artifactKeys = Object.keys(artifacts);

  if (artifactKeys.length === 0) {
    return (
      <div className="jp-projspec-artifacts-empty">No artifacts available</div>
    );
  }

  return (
    <div className="jp-projspec-artifacts">
      {artifactKeys.map(artifactName => {
        const artifact = artifacts[artifactName];

        // String artifacts come from compact mode (default in projspec)
        if (typeof artifact === 'string') {
          return (
            <StringArtifactItem
              key={artifactName}
              name={artifactName}
              artifact={artifact}
            />
          );
        }

        // Object artifacts come from non-compact mode
        return (
          <ObjectArtifactItem
            key={artifactName}
            name={artifactName}
            artifact={artifact}
          />
        );
      })}
    </div>
  );
}
