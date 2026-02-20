import { ServerConnection } from '@jupyterlab/services';
import { URLExt } from '@jupyterlab/coreutils';
import { requestAPI } from './request';

/**
 * Request body for the make endpoint.
 * Sends artifact identifiers instead of raw commands for security.
 */
export interface IMakeRequest {
  /** Relative path from server root (empty string for root). */
  path: string;
  /** The projspec spec type (e.g., "python_library", "node"). */
  spec_type: string;
  /** The artifact name (e.g., "wheel", "build"). */
  artifact_name: string;
}

/**
 * Response from the make endpoint.
 */
interface IMakeResponse {
  stdout: string;
  stderr: string;
  returncode: number;
  /** True when stdout or stderr was truncated by the server. */
  truncated: boolean;
}

/**
 * Execute an artifact's build command via the backend.
 *
 * The backend resolves the actual shell command from projspec's artifact
 * registry, ensuring only valid, known commands can be executed.
 *
 * @param request - Artifact identifiers (path, spec_type, artifact_name)
 * @returns The command execution result with stdout, stderr, and returncode
 */
export async function make(request: IMakeRequest): Promise<IMakeResponse> {
  try {
    const response = await requestAPI<IMakeResponse>('make', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    if (response === undefined) {
      throw new Error('Make request returned an empty response');
    }
    return response;
  } catch (err) {
    if (err instanceof ServerConnection.ResponseError) {
      const status = err.response.status;
      let detail = err.message;

      // Truncate HTML responses for cleaner error messages
      if (
        typeof detail === 'string' &&
        (detail.includes('<!DOCTYPE') || detail.includes('<html'))
      ) {
        detail = `HTML error page (${detail.substring(0, 100)}...)`;
      }

      throw new Error(`Make request failed (${status}): ${detail}`);
    }

    const msg = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(`Make request failed: ${msg}`);
  }
}

/**
 * A single jupyter-fs resource entry returned by `GET /jupyterfs/resources`.
 */
export interface IJfsResource {
  url: string;
  drive: string;
  name: string;
  [key: string]: unknown;
}

/**
 * Compute a sidebar widget ID using the same formula as jupyter-fs's
 * `idFromResource`: `<name_without_spaces>_<drive>`.
 */
function jfsSidebarId(resource: IJfsResource): string {
  return resource.name.split(' ').join('') + '_' + resource.drive;
}

/**
 * Fetch the list of configured jupyter-fs resources from the server.
 *
 * @returns A map of sidebar widget ID to resource URL, or null if
 *   jupyter-fs is not available. The sidebar ID is computed using the
 *   same formula as jupyter-fs (`<name_without_spaces>_<drive>`).
 */
export async function fetchJfsResources(): Promise<Map<string, string> | null> {
  const settings = ServerConnection.makeSettings();
  const requestUrl = URLExt.join(settings.baseUrl, 'jupyterfs', 'resources');

  let response: Response;
  try {
    response = await ServerConnection.makeRequest(requestUrl, {}, settings);
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  let resources: IJfsResource[];
  try {
    resources = (await response.json()) as IJfsResource[];
  } catch {
    return null;
  }

  if (!Array.isArray(resources)) {
    return null;
  }

  const idToUrl = new Map<string, string>();
  for (const resource of resources) {
    if (resource.drive && resource.url && resource.name) {
      idToUrl.set(jfsSidebarId(resource), resource.url);
    }
  }
  return idToUrl;
}
