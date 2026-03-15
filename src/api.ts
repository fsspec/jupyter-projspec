import { ServerConnection } from '@jupyterlab/services';
import { ICreatableType, ICreateRequest, ICreateResponse } from './types';
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
 * Extract a user-friendly error message from a caught error.
 */
function extractErrorMessage(err: unknown, context: string): string {
  if (err instanceof ServerConnection.ResponseError) {
    const status = err.response.status;
    let detail = err.message;

    if (
      typeof detail === 'string' &&
      (detail.includes('<!DOCTYPE') || detail.includes('<html'))
    ) {
      detail = `HTML error page (${detail.substring(0, 100)}...)`;
    }

    return `${context} (${status}): ${detail}`;
  }

  const msg = err instanceof Error ? err.message : 'Unknown error';
  return `${context}: ${msg}`;
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
    throw new Error(extractErrorMessage(err, 'Make request failed'));
  }
}

/**
 * Module-level cache for creatable types.
 * The list is static for the lifetime of the server, so we fetch once.
 */
let creatableTypesCache: ICreatableType[] | null = null;

/**
 * Fetch the list of project types that support creation.
 *
 * Results are cached after the first successful call since the
 * projspec registry does not change at runtime.
 */
export async function fetchCreatableTypes(): Promise<ICreatableType[]> {
  if (creatableTypesCache !== null) {
    return creatableTypesCache;
  }

  try {
    const response = await requestAPI<{ types: ICreatableType[] }>(
      'creatable-types',
      { method: 'GET' }
    );
    if (!response?.types) {
      throw new Error('Empty response from server');
    }
    creatableTypesCache = response.types;
    return creatableTypesCache;
  } catch (err) {
    throw new Error(
      extractErrorMessage(err, 'Failed to fetch creatable types')
    );
  }
}

/**
 * Create a new project type in the specified directory.
 *
 * @param request - The path and type_name for creation
 * @returns The list of files created by projspec
 */
export async function createProject(
  request: ICreateRequest
): Promise<ICreateResponse> {
  try {
    const response = await requestAPI<ICreateResponse>('create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    if (response === undefined) {
      throw new Error('Create request returned an empty response');
    }
    return response;
  } catch (err) {
    throw new Error(extractErrorMessage(err, 'Create project failed'));
  }
}
