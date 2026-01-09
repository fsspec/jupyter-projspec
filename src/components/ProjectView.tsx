import React from 'react';
import { IProject } from '../types';
import { SpecItem } from './SpecItem';

/**
 * Props for the ProjectView component.
 */
interface IProjectViewProps {
  project: IProject;
}

/**
 * Component for rendering the project overview.
 * Shows the list of detected specs (project types).
 */
export function ProjectView({ project }: IProjectViewProps): React.ReactElement {
  const specs = project.specs ?? {};
  const specNames = Object.keys(specs);

  if (specNames.length === 0) {
    return (
      <div className="jp-projspec-no-specs">
        <div className="jp-projspec-no-specs-icon">📂</div>
        <p className="jp-projspec-no-specs-title">No project detected</p>
        <p className="jp-projspec-no-specs-hint">
          projspec can detect Python packages, Rust crates, Node.js projects,
          conda-project, pixi, uv, poetry, and more.
        </p>
      </div>
    );
  }

  return (
    <div className="jp-projspec-project-view">
      <div className="jp-projspec-specs-header">
        Detected Project Types ({specNames.length})
      </div>
      <div className="jp-projspec-specs-list">
        {specNames.map(specName => (
          <SpecItem key={specName} name={specName} spec={specs[specName]} />
        ))}
      </div>
    </div>
  );
}

