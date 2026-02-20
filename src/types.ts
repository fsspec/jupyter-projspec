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
  cmd?: string | string[];
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

/**
 * Scan source for a local directory (default file browser).
 */
export interface ILocalScanSource {
  type: 'local';
  path: string;
}

/**
 * Scan source for a jupyter-fs resource (fsspec URL).
 */
export interface IJfsScanSource {
  type: 'jfs';
  url: string;
  subpath: string;
}

/**
 * Discriminated union: local file browser path or jupyter-fs resource URL.
 */
export type ScanSource = ILocalScanSource | IJfsScanSource;

/**
 * Value-compare two scan sources, treating null as equal only to itself.
 */
export function scanSourcesEqual(
  a: ScanSource | null,
  b: ScanSource | null
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  if (a.type !== b.type) {
    return false;
  }
  if (a.type === 'local' && b.type === 'local') {
    return a.path === b.path;
  }
  if (a.type === 'jfs' && b.type === 'jfs') {
    return a.url === b.url && a.subpath === b.subpath;
  }
  return false;
}

/**
 * Human-readable label for a scan source (empty string for null).
 */
export function formatScanSource(source: ScanSource | null): string {
  if (source === null) {
    return '';
  }
  if (source.type === 'local') {
    return source.path === '' || source.path === '/' ? '/ (root)' : source.path;
  }
  const base = source.url;
  if (!source.subpath) {
    return base;
  }
  return `${base.replace(/\/+$/, '')}/${source.subpath}`;
}

/**
 * Build the REST endpoint path for a scan request.
 */
export function buildScanEndpoint(source: ScanSource): string {
  if (source.type === 'local') {
    return `scan?path=${encodeURIComponent(source.path)}`;
  }
  return 'scan-url';
}

/**
 * Build the RequestInit options for a scan request.
 * Local scans use GET; jfs scans use POST with URL in the body
 * to avoid leaking credentials in query strings / server logs.
 */
export function buildScanInit(
  source: ScanSource,
  extra?: RequestInit
): RequestInit {
  if (source.type === 'local') {
    return { method: 'GET', ...extra };
  }
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: source.url, subpath: source.subpath }),
    ...extra
  };
}

/**
 * Stable string key for a scan source (null when source is null).
 * Used to detect stale responses and as a React effect dependency.
 */
export function scanSourceKey(source: ScanSource | null): string | null {
  if (source === null) {
    return null;
  }
  if (source.type === 'local') {
    return `local:${source.path}`;
  }
  return `jfs:${source.url}:${source.subpath}`;
}
