import React, { useState, useEffect, useRef } from 'react';
import { ISpec } from '../types';
import { ContentsView } from './ContentsView';
import { ArtifactsView } from './ArtifactsView';
import { getSpecInfo, getTextColorForBackground } from '../specInfo';

/**
 * Props for the SpecItem component.
 */
interface ISpecItemProps {
  name: string;
  spec: ISpec;
  defaultExpanded?: boolean;
  /** When true, forces this spec to expand (triggered by chip click). */
  forceExpanded?: boolean;
  /** Unique ID that changes on each expand request, ensures expansion always triggers. */
  expandRequestId?: number;
}

/**
 * Component for rendering a single spec (detected project type).
 * Shows the spec name with an icon, and expandable sections for contents and artifacts.
 */
export function SpecItem({
  name,
  spec,
  defaultExpanded = false,
  forceExpanded = false,
  expandRequestId = 0
}: ISpecItemProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const itemRef = useRef<HTMLDivElement>(null);
  const lastProcessedRequestId = useRef(0);

  const contents = spec._contents ?? {};
  const artifacts = spec._artifacts ?? {};
  const hasContents = Object.keys(contents).length > 0;
  const hasArtifacts = Object.keys(artifacts).length > 0;
  const hasDetails = hasContents || hasArtifacts;

  // Respond to expand requests - expand and scroll into view
  useEffect(() => {
    // Only process if this is a new request AND this spec should be expanded
    if (
      forceExpanded &&
      expandRequestId > lastProcessedRequestId.current &&
      hasDetails
    ) {
      lastProcessedRequestId.current = expandRequestId;
      setIsExpanded(true);
      // Scroll into view after a short delay to allow render
      setTimeout(() => {
        itemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }, [forceExpanded, expandRequestId, hasDetails]);

  const handleToggle = () => {
    if (hasDetails) {
      setIsExpanded(!isExpanded);
    }
  };

  const info = getSpecInfo(name);
  const textColor = getTextColorForBackground(info.color);

  return (
    <div
      ref={itemRef}
      className={`jp-projspec-spec-item ${isExpanded ? 'expanded' : ''}`}
    >
      <div
        className={`jp-projspec-spec-header ${hasDetails ? 'clickable' : ''}`}
        style={{
          backgroundColor: info.color,
          color: textColor
        }}
        onClick={handleToggle}
        role={hasDetails ? 'button' : undefined}
        tabIndex={hasDetails ? 0 : undefined}
        onKeyDown={e => {
          if (hasDetails && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handleToggle();
          }
        }}
      >
        {hasDetails && (
          <span className="jp-projspec-spec-chevron">
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        <span className="jp-projspec-spec-icon">{info.icon}</span>
        <span className="jp-projspec-spec-name">{info.displayName}</span>
        <div className="jp-projspec-spec-badges">
          {hasContents && (
            <span
              className="jp-projspec-badge jp-projspec-badge-contents"
              style={{ color: textColor, borderColor: textColor }}
            >
              {Object.keys(contents).length} content
            </span>
          )}
          {hasArtifacts && (
            <span
              className="jp-projspec-badge jp-projspec-badge-artifacts"
              style={{ color: textColor, borderColor: textColor }}
            >
              {Object.keys(artifacts).length} artifact
            </span>
          )}
        </div>
      </div>

      {isExpanded && hasDetails && (
        <div className="jp-projspec-spec-body">
          {hasContents && (
            <div className="jp-projspec-spec-section">
              <div className="jp-projspec-section-header">Contents</div>
              <ContentsView contents={contents} />
            </div>
          )}
          {hasArtifacts && (
            <div className="jp-projspec-spec-section">
              <div className="jp-projspec-section-header">Artifacts</div>
              <ArtifactsView artifacts={artifacts} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

