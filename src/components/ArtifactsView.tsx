import React, { useState } from 'react';
import { IArtifact } from '../types';
import { make } from '../api';

/**
 * Maximum characters of command output to display before truncating.
 */
const MAX_OUTPUT_LENGTH = 10000;

/**
 * Props for the ArtifactsView component.
 */
interface IArtifactsViewProps {
  artifacts: Record<string, IArtifact | string>;
  /** Relative path from server root for the project. */
  path: string;
  /** The projspec spec type (e.g., "python_library"). */
  specType: string;
}

/**
 * Parse a compact artifact string into parts.
 * Format: "command args, status" -> { cmd: "command args", status: "status" }
 * The last comma separates the command from the status field.
 *
 * WARNING: Commands containing commas (e.g., `echo 'a,b'`) will be
 * incorrectly split. The projspec compact format assumes commas do not
 * appear in command strings.
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
 * Normalize a status string into a safe CSS class token.
 * Strips non-alphanumeric characters and lowercases.
 * Falls back to "unknown" if the result is empty.
 */
function safeStatusClass(status: string): string {
  const safe = status.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return safe || 'unknown';
}

/**
 * Truncate a string to a maximum length, appending a notice if truncated.
 */
function truncateOutput(text: string): string {
  if (text.length <= MAX_OUTPUT_LENGTH) {
    return text;
  }
  return text.slice(0, MAX_OUTPUT_LENGTH) + '\n... (output truncated)';
}

/**
 * Shared hook for running a make request and tracking state.
 */
function useMakeArtifact(
  path: string,
  specType: string,
  artifactName: string
): {
  isRunning: boolean;
  result: string | null;
  handleMake: () => Promise<void>;
} {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleMake = async () => {
    // Guard against double-invocation before React applies disabled state
    if (isRunning) {
      return;
    }

    setIsRunning(true);
    setResult(null);

    try {
      const response = await make({
        path,
        spec_type: specType,
        artifact_name: artifactName
      });

      if (response.returncode === 0) {
        const output = truncateOutput(response.stdout.trim());
        setResult(output ? `Success\n${output}` : 'Success');
      } else {
        setResult(
          `Failed (exit ${response.returncode}): ${truncateOutput(response.stderr)}`
        );
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setResult(`Error: ${errorMsg}`);
    } finally {
      setIsRunning(false);
    }
  };

  return { isRunning, result, handleMake };
}

/**
 * Shared component for displaying make result output.
 */
function MakeResult({
  result
}: {
  result: string | null;
}): React.ReactElement | null {
  if (!result) {
    return null;
  }
  return (
    <details>
      <summary>
        {result.startsWith('Success') ? '✅ Success' : '❌ Failed'} (click for
        details)
      </summary>
      <pre className="jp-projspec-result-output">{result}</pre>
    </details>
  );
}

/**
 * Shared Make button component.
 */
function MakeButton({
  isRunning,
  onClick
}: {
  isRunning: boolean;
  onClick: (e: React.MouseEvent) => void;
}): React.ReactElement {
  return (
    <button
      onClick={e => {
        e.stopPropagation();
        e.preventDefault();
        onClick(e);
      }}
      disabled={isRunning}
      className="jp-projspec-make-button"
    >
      {isRunning ? '⏳ Running...' : '▶️ Make'}
    </button>
  );
}

/**
 * Props for a single artifact item (string form).
 */
interface IStringArtifactItemProps {
  name: string;
  artifact: string;
  /** Relative path from server root for the project. */
  path: string;
  /** The projspec spec type (e.g., "python_library"). */
  specType: string;
}

/**
 * Component for rendering a string artifact (compact mode from projspec).
 * Format: "command args, status"
 */
function StringArtifactItem({
  name,
  artifact,
  path,
  specType
}: IStringArtifactItemProps): React.ReactElement {
  const { cmd, status } = parseCompactArtifact(artifact);
  const { isRunning, result, handleMake } = useMakeArtifact(
    path,
    specType,
    name
  );

  return (
    <div className="jp-projspec-artifact-item jp-projspec-artifact-string">
      <div className="jp-projspec-artifact-header">
        <span className="jp-projspec-artifact-icon">📦</span>
        <span className="jp-projspec-artifact-name">{name}</span>
        {status && (
          <span
            className={`jp-projspec-artifact-status jp-projspec-status-${safeStatusClass(status)}`}
          >
            {status}
          </span>
        )}
        <MakeButton isRunning={isRunning} onClick={handleMake} />
      </div>
      <code
        className="jp-projspec-artifact-cmd"
        title="Declared command from projspec"
      >
        {cmd}
      </code>
      <MakeResult result={result} />
    </div>
  );
}

/**
 * Props for a single artifact item (object form).
 */
interface IObjectArtifactItemProps {
  name: string;
  artifact: IArtifact;
  /** Relative path from server root for the project. */
  path: string;
  /** The projspec spec type (e.g., "python_library"). */
  specType: string;
}

/**
 * Component for rendering an object artifact (non-compact mode).
 * Includes a Make button when the artifact has a command defined.
 */
function ObjectArtifactItem({
  name,
  artifact,
  path,
  specType
}: IObjectArtifactItemProps): React.ReactElement {
  const hasCmd = artifact.cmd !== undefined && artifact.cmd !== '';
  const { isRunning, result, handleMake } = useMakeArtifact(
    path,
    specType,
    name
  );

  // Filter out empty or internal fields
  const displayFields = Object.entries(artifact).filter(
    ([key, value]) =>
      !key.startsWith('_') &&
      value !== null &&
      value !== undefined &&
      value !== ''
  );

  return (
    <details className="jp-projspec-artifact-item" open={false}>
      <summary className="jp-projspec-artifact-name">
        <span className="jp-projspec-artifact-icon">📦</span>
        {name}
        {artifact.status && (
          <span
            className={`jp-projspec-artifact-status jp-projspec-status-${safeStatusClass(artifact.status)}`}
          >
            {artifact.status}
          </span>
        )}
        {hasCmd && <MakeButton isRunning={isRunning} onClick={handleMake} />}
      </summary>
      <div className="jp-projspec-artifact-details">
        {displayFields.length > 0 ? (
          <dl className="jp-projspec-artifact-fields">
            {displayFields
              .filter(([key]) => key !== 'status')
              .map(([key, value]) => (
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
              ))}
          </dl>
        ) : (
          <div className="jp-projspec-artifact-no-details">
            No additional details
          </div>
        )}
        <MakeResult result={result} />
      </div>
    </details>
  );
}

/**
 * Component for rendering the artifacts of a spec.
 * Handles both string artifacts (compact mode) and object artifacts.
 */
export function ArtifactsView({
  artifacts,
  path,
  specType
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
              path={path}
              specType={specType}
            />
          );
        }

        // Object artifacts come from non-compact mode
        return (
          <ObjectArtifactItem
            key={artifactName}
            name={artifactName}
            artifact={artifact}
            path={path}
            specType={specType}
          />
        );
      })}
    </div>
  );
}
