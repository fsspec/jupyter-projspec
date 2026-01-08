import { Widget } from '@lumino/widgets';
import { requestAPI } from '../request';

/**
 * CSS class for the projspec panel widget.
 */
const PANEL_CLASS = 'jp-projspec-Panel';

/**
 * Debounce delay in milliseconds.
 */
const DEBOUNCE_DELAY = 300;

/**
 * Response type from the scan endpoint.
 */
interface ScanResponse {
  html?: string;
  error?: string;
}

/**
 * A widget that displays projspec information for the current directory.
 */
export class ProjspecPanel extends Widget {
  private _contentElement: HTMLElement;
  private _currentPath: string;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _currentRequest: AbortController | null = null;

  constructor() {
    super();
    this.addClass(PANEL_CLASS);
    this.id = 'projspec-panel';
    this.title.label = 'Project Spec';
    this.title.closable = true;
    this._currentPath = '';

    // Create the panel content container
    this._contentElement = document.createElement('div');
    this._contentElement.className = 'jp-projspec-Panel-content';
    this._contentElement.innerHTML = this._renderInitialState();

    this.node.appendChild(this._contentElement);
  }

  /**
   * Get the current path being displayed.
   */
  get currentPath(): string {
    return this._currentPath;
  }

  /**
   * Update the displayed path and scan the directory.
   * @param path - The new path to scan.
   */
  updatePath(path: string): void {
    this._currentPath = path;

    // Cancel any pending debounce timer
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }

    // Show loading state immediately
    this._renderLoading(path);

    // Debounce the actual scan request
    this._debounceTimer = setTimeout(() => {
      this._scanDirectory(path);
    }, DEBOUNCE_DELAY);
  }

  /**
   * Render the initial state before any path is set.
   */
  private _renderInitialState(): string {
    return `
      <div class="jp-projspec-Panel-header">Project Spec</div>
      <div class="jp-projspec-Panel-message">
        <p>No directory selected</p>
      </div>
    `;
  }

  /**
   * Render the loading state.
   */
  private _renderLoading(path: string): void {
    const displayPath = path === '' || path === '/' ? '/ (root)' : path;
    this._contentElement.innerHTML = `
      <div class="jp-projspec-Panel-header">Project Spec</div>
      <div class="jp-projspec-Panel-path">${this._escapeHtml(displayPath)}</div>
      <div class="jp-projspec-Panel-loading">
        <div class="jp-projspec-Panel-spinner"></div>
        <span>Scanning directory...</span>
      </div>
    `;
  }

  /**
   * Render the projspec HTML output.
   */
  private _renderProjspec(path: string, html: string): void {
    const displayPath = path === '' || path === '/' ? '/ (root)' : path;
    this._contentElement.innerHTML = `
      <div class="jp-projspec-Panel-header">Project Spec</div>
      <div class="jp-projspec-Panel-path">${this._escapeHtml(displayPath)}</div>
      <div class="jp-projspec-Panel-projspec">${html}</div>
    `;
  }

  /**
   * Render an error state.
   */
  private _renderError(path: string, error: string): void {
    const displayPath = path === '' || path === '/' ? '/ (root)' : path;
    this._contentElement.innerHTML = `
      <div class="jp-projspec-Panel-header">Project Spec</div>
      <div class="jp-projspec-Panel-path">${this._escapeHtml(displayPath)}</div>
      <div class="jp-projspec-Panel-error">
        <span class="jp-projspec-Panel-error-icon">⚠</span>
        <span>${this._escapeHtml(error)}</span>
      </div>
    `;
  }

  /**
   * Scan a directory using the projspec backend.
   */
  private async _scanDirectory(path: string): Promise<void> {
    // Cancel any in-flight request
    if (this._currentRequest !== null) {
      this._currentRequest.abort();
    }

    // Create a new abort controller for this request
    this._currentRequest = new AbortController();

    try {
      const response = await requestAPI<ScanResponse>(
        `scan?path=${encodeURIComponent(path)}`,
        {
          method: 'GET',
          signal: this._currentRequest.signal
        }
      );

      // Check if this is still the current path (user may have navigated away)
      if (path !== this._currentPath) {
        return;
      }

      if (response.error) {
        this._renderError(path, response.error);
      } else if (response.html) {
        this._renderProjspec(path, response.html);
      } else {
        this._renderError(path, 'Unexpected response from server');
      }
    } catch (err: unknown) {
      // Check if this is still the current path
      if (path !== this._currentPath) {
        return;
      }

      // Ignore abort errors (user navigated away)
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      // Extract error message
      let message = 'Unknown error occurred';
      if (err instanceof Error) {
        message = err.message;

        // Try to parse error details from the response
        const match = message.match(/API request failed \(\d+\): (.+)/);
        if (match) {
          try {
            const parsed = JSON.parse(match[1]);
            if (parsed.error) {
              message = parsed.error;
            }
          } catch {
            // Keep original message if not JSON
          }
        }
      }

      this._renderError(path, message);
    } finally {
      this._currentRequest = null;
    }
  }

  /**
   * Escape HTML special characters to prevent XSS.
   * Note: The projspec HTML is trusted and not escaped.
   */
  private _escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Dispose of the widget and clean up resources.
   */
  dispose(): void {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this._currentRequest !== null) {
      this._currentRequest.abort();
      this._currentRequest = null;
    }
    super.dispose();
  }
}
