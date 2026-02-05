import { ServerConnection } from '@jupyterlab/services';
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
    return await requestAPI<IMakeResponse>('make', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
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
