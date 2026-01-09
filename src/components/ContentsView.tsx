import React from 'react';
import { IContent } from '../types';

/**
 * Props for the ContentsView component.
 */
interface IContentsViewProps {
  contents: Record<string, IContent>;
}

/**
 * Renders an individual value, handling different types appropriately.
 */
function renderValue(value: unknown, depth: number = 0): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="jp-projspec-value-null">null</span>;
  }

  if (typeof value === 'boolean') {
    return (
      <span className="jp-projspec-value-boolean">{value.toString()}</span>
    );
  }

  if (typeof value === 'number') {
    return <span className="jp-projspec-value-number">{value}</span>;
  }

  if (typeof value === 'string') {
    // Check if it's a path or URL
    if (value.startsWith('/') || value.startsWith('http')) {
      return <code className="jp-projspec-value-path">{value}</code>;
    }
    return <span className="jp-projspec-value-string">{value}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="jp-projspec-value-empty">[]</span>;
    }
    return (
      <ul className="jp-projspec-array">
        {value.map((item, idx) => (
          <li key={idx}>{renderValue(item, depth + 1)}</li>
        ))}
      </ul>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="jp-projspec-value-empty">{'{}'}</span>;
    }

    // For deeply nested objects, show as collapsible
    if (depth > 1) {
      return (
        <details className="jp-projspec-nested-object">
          <summary>{`{${entries.length} fields}`}</summary>
          <ObjectView data={value as Record<string, unknown>} depth={depth} />
        </details>
      );
    }

    return <ObjectView data={value as Record<string, unknown>} depth={depth} />;
  }

  return <span>{String(value)}</span>;
}

/**
 * Renders a key-value object view.
 */
function ObjectView({
  data,
  depth = 0
}: {
  data: Record<string, unknown>;
  depth?: number;
}): React.ReactElement {
  const entries = Object.entries(data).filter(
    ([key]) => !key.startsWith('_') // Skip internal fields
  );

  if (entries.length === 0) {
    return <div className="jp-projspec-empty-object">No data</div>;
  }

  return (
    <dl className="jp-projspec-object-view">
      {entries.map(([key, value]) => (
        <div key={key} className="jp-projspec-kv-row">
          <dt className="jp-projspec-key">{key}</dt>
          <dd className="jp-projspec-value">{renderValue(value, depth + 1)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Renders content data, handling both arrays and objects appropriately.
 */
function renderContentData(content: unknown): React.ReactNode {
  // If content is an array, render it as a list
  if (Array.isArray(content)) {
    if (content.length === 0) {
      return <div className="jp-projspec-empty-object">Empty list</div>;
    }
    return (
      <ul className="jp-projspec-content-list">
        {content.map((item, idx) => (
          <li key={idx} className="jp-projspec-content-list-item">
            {renderValue(item, 0)}
          </li>
        ))}
      </ul>
    );
  }

  // If content is an object, render it with ObjectView
  if (content && typeof content === 'object') {
    return <ObjectView data={content as Record<string, unknown>} />;
  }

  // For primitive values, render directly
  return renderValue(content, 0);
}

/**
 * Component for rendering the contents of a spec.
 * Displays contents as nested key-value pairs.
 */
export function ContentsView({ contents }: IContentsViewProps): React.ReactElement {
  const contentKeys = Object.keys(contents);

  if (contentKeys.length === 0) {
    return (
      <div className="jp-projspec-contents-empty">No contents available</div>
    );
  }

  return (
    <div className="jp-projspec-contents">
      {contentKeys.map(contentType => {
        const content = contents[contentType];
        return (
          <details key={contentType} className="jp-projspec-content-item">
            <summary className="jp-projspec-content-name">{contentType}</summary>
            <div className="jp-projspec-content-data">
              {renderContentData(content)}
            </div>
          </details>
        );
      })}
    </div>
  );
}

