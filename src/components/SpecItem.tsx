import React, { useState } from 'react';
import { ISpec } from '../types';
import { ContentsView } from './ContentsView';
import { ArtifactsView } from './ArtifactsView';

/**
 * Props for the SpecItem component.
 */
interface ISpecItemProps {
  name: string;
  spec: ISpec;
  defaultExpanded?: boolean;
}

/**
 * Display names for spec types.
 *
 * Maps projspec snake_case identifiers to human-readable names.
 * When adding new specs to projspec, add corresponding entries here.
 *
 * To find all spec types in projspec, run:
 *   grep -r "class.*ProjectSpec" /path/to/projspec/src/projspec/proj/
 */
const SPEC_DISPLAY_NAMES: Record<string, string> = {
  // Version control
  git_repo: 'Git Repository',

  // Python ecosystem
  python_library: 'Python Library',
  python_code: 'Python Code',
  poetry: 'Poetry',
  uv: 'uv',
  uv_script: 'uv Script',
  pixi: 'Pixi',
  conda_project: 'Conda Project',
  conda_recipe: 'Conda Recipe',
  py_script: 'PyScript',
  briefcase: 'Briefcase',

  // JavaScript/Node ecosystem
  node: 'Node.js',
  yarn: 'Yarn',
  j_lab_extension: 'JupyterLab Extension',

  // Rust
  rust: 'Rust Crate',

  // Documentation
  md_book: 'mdBook',
  r_t_d: 'Read the Docs',

  // Data & ML
  data_package: 'Data Package',
  hugging_face_repo: 'Hugging Face',

  // IDEs & Editors
  vs_code: 'VS Code',
  jetbrains_ide: 'JetBrains IDE',
  zed: 'Zed',
  nvidia_ai_workbench: 'NVIDIA AI Workbench',

  // Other
  backstage_catalog: 'Backstage Catalog'
};

/**
 * Icons for spec types.
 *
 * Maps projspec snake_case identifiers to emoji icons.
 * Unknown specs fall back to the default icon.
 */
const SPEC_ICONS: Record<string, string> = {
  // Version control
  git_repo: '🔀',

  // Python ecosystem
  python_library: '🐍',
  python_code: '🐍',
  poetry: '📜',
  uv: '⚡',
  uv_script: '⚡',
  pixi: '🔮',
  conda_project: '🐍',
  conda_recipe: '📦',
  py_script: '🌐',
  briefcase: '💼',

  // JavaScript/Node ecosystem
  node: '📦',
  yarn: '🧶',
  j_lab_extension: '🪐',

  // Rust
  rust: '🦀',

  // Documentation
  md_book: '📖',
  r_t_d: '📚',

  // Data & ML
  data_package: '📊',
  hugging_face_repo: '🤗',

  // IDEs & Editors
  vs_code: '💻',
  jetbrains_ide: '🧠',
  zed: '⚡',
  nvidia_ai_workbench: '🖥️',

  // Other
  backstage_catalog: '🎭',

  // Default fallback
  default: '📋'
};

/**
 * Get the display name for a spec type.
 * Falls back to converting snake_case to Title Case if not in the mapping.
 */
function getSpecDisplayName(specName: string): string {
  if (specName in SPEC_DISPLAY_NAMES) {
    return SPEC_DISPLAY_NAMES[specName];
  }
  // Fallback: convert snake_case to Title Case
  return specName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get the icon for a spec type.
 */
function getSpecIcon(specName: string): string {
  return SPEC_ICONS[specName] ?? SPEC_ICONS.default;
}

/**
 * Component for rendering a single spec (detected project type).
 * Shows the spec name with an icon, and expandable sections for contents and artifacts.
 */
export function SpecItem({
  name,
  spec,
  defaultExpanded = false
}: ISpecItemProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const contents = spec._contents ?? {};
  const artifacts = spec._artifacts ?? {};
  const hasContents = Object.keys(contents).length > 0;
  const hasArtifacts = Object.keys(artifacts).length > 0;
  const hasDetails = hasContents || hasArtifacts;

  const handleToggle = () => {
    if (hasDetails) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div className={`jp-projspec-spec-item ${isExpanded ? 'expanded' : ''}`}>
      <div
        className={`jp-projspec-spec-header ${hasDetails ? 'clickable' : ''}`}
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
        <span className="jp-projspec-spec-icon">{getSpecIcon(name)}</span>
        <span className="jp-projspec-spec-name">{getSpecDisplayName(name)}</span>
        <div className="jp-projspec-spec-badges">
          {hasContents && (
            <span className="jp-projspec-badge jp-projspec-badge-contents">
              {Object.keys(contents).length} contents
            </span>
          )}
          {hasArtifacts && (
            <span className="jp-projspec-badge jp-projspec-badge-artifacts">
              {Object.keys(artifacts).length} artifacts
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

