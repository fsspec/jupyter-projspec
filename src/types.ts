/**
 * TypeScript interfaces for projspec JSON response structure.
 *
 * Based on the projspec.Project.to_dict() output structure.
 */

/**
 * Artifact data from projspec (non-compact mode).
 * Contains information about buildable artifacts like wheels, conda packages, etc.
 */
export interface IArtifact {
  cmd?: string;
  fn?: string;
  status?: string;
  [key: string]: unknown;
}

/**
 * Artifact value from projspec.
 * In compact mode (default), artifacts are strings like "command args, status".
 * In non-compact mode, artifacts are full IArtifact objects.
 */
export type ArtifactValue = string | IArtifact;

/**
 * Content data from projspec.
 * Contains descriptive information like metadata, environments, dependencies, etc.
 */
export interface IContent {
  [key: string]: unknown;
}

/**
 * A single spec (detected project type) from projspec.
 * Each spec contains its contents and artifacts.
 */
export interface ISpec {
  _contents: Record<string, IContent>;
  _artifacts: Record<string, ArtifactValue>;
  subpath: string;
  [key: string]: unknown;
}

/**
 * Child project in a subdirectory.
 */
export interface IChildProject {
  specs: Record<string, ISpec>;
  children: Record<string, IChildProject>;
  url: string;
  storage_options?: Record<string, unknown>;
  artifacts?: Record<string, IArtifact>;
  contents?: Record<string, IContent>;
}

/**
 * Top-level project data from projspec.to_dict().
 */
export interface IProject {
  specs: Record<string, ISpec>;
  children: Record<string, IChildProject>;
  url: string;
  storage_options?: Record<string, unknown>;
  artifacts?: Record<string, IArtifact>;
  contents?: Record<string, IContent>;
}

/**
 * Response from the scan endpoint.
 */
export interface IScanResponse {
  project?: IProject;
  error?: string;
}

