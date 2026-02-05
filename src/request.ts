import { URLExt } from '@jupyterlab/coreutils';

import { ServerConnection } from '@jupyterlab/services';

/**
 * Call the server extension.
 *
 * Sends a request to the jupyter-projspec backend and returns the
 * parsed JSON response. Throws a ResponseError for non-OK status codes
 * and a NetworkError for connection failures.
 *
 * @param endPoint API REST end point for the extension
 * @param init Initial values for the request
 * @returns The response body interpreted as JSON
 * @throws ServerConnection.ResponseError if the response is non-OK or non-JSON
 * @throws ServerConnection.NetworkError on connection failure
 */
export async function requestAPI<T>(
  endPoint = '',
  init: RequestInit = {}
): Promise<T> {
  // Make request to Jupyter API
  const settings = ServerConnection.makeSettings();
  const requestUrl = URLExt.join(
    settings.baseUrl,
    'jupyter-projspec', // our server extension's API namespace
    endPoint
  );

  let response: Response;
  try {
    response = await ServerConnection.makeRequest(requestUrl, init, settings);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new ServerConnection.NetworkError(error);
    }
    throw error;
  }

  const text = await response.text();

  if (!response.ok) {
    // Try to extract a structured error message from JSON error responses
    let errorMessage: string;
    try {
      const data = JSON.parse(text);
      if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
        errorMessage = String(
          (data as Record<string, unknown>).error ||
            (data as Record<string, unknown>).message ||
            JSON.stringify(data)
        );
      } else {
        errorMessage = text;
      }
    } catch {
      errorMessage = text;
    }

    // Truncate large error bodies (HTML pages, stack traces, etc.)
    if (errorMessage && errorMessage.length > 500) {
      errorMessage = errorMessage.slice(0, 500) + '... (truncated)';
    }

    throw new ServerConnection.ResponseError(
      response,
      errorMessage || response.statusText || `HTTP ${response.status}`
    );
  }

  // Allow empty responses for 204 No Content or other success codes
  if (!text) {
    return undefined as unknown as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ServerConnection.ResponseError(
      response,
      `Expected JSON response, got: ${text.slice(0, 100)}`
    );
  }
}
