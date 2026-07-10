import React from 'react';
import { ReactWidget } from '@jupyterlab/ui-components';
import { ProjspecPanelComponent } from '../components';

/**
 * CSS class for the projspec panel widget.
 */
const PANEL_CLASS = 'jp-projspec-Panel';

/**
 * A widget that displays projspec information for the current directory.
 * Uses React for rendering via ReactWidget.
 */
export class ProjspecPanel extends ReactWidget {
  private _currentPath: string;
  private _expandedSpecName: string | null;
  private _expandRequestId: number;
  private _scanRevision: number;
  private _onCreateProject: (() => void) | null;

  constructor() {
    super();
    this.addClass(PANEL_CLASS);
    this.id = 'projspec-panel';
    this.title.caption = 'Project Spec';
    this.title.closable = true;
    this._currentPath = '';
    this._expandedSpecName = null;
    this._expandRequestId = 0;
    this._scanRevision = 0;
    this._onCreateProject = null;
  }

  /**
   * Get the current path being displayed.
   */
  get currentPath(): string {
    return this._currentPath;
  }

  /**
   * Set the callback invoked when the user clicks the "+" create button.
   */
  set onCreateProject(callback: (() => void) | null) {
    this._onCreateProject = callback;
    this.update();
  }

  /**
   * Update the displayed path and trigger a re-render.
   * @param path - The new path to scan.
   */
  updatePath(path: string): void {
    if (this._currentPath !== path) {
      this._currentPath = path;
      this._expandedSpecName = null;
      this.update();
    }
  }

  /**
   * Force a re-scan of the current directory.
   * Bumps an internal revision counter so the React effect re-fires
   * even though the path hasn't changed.
   */
  refreshScan(): void {
    this._scanRevision++;
    this.update();
  }

  /**
   * Expand a specific spec by name and trigger a re-render.
   * @param specName - The spec name to expand (e.g., 'python_library').
   */
  expandSpec(specName: string): void {
    this._expandedSpecName = specName;
    this._expandRequestId++;
    this.update();
  }

  /**
   * Render the React component.
   */
  render(): React.ReactElement {
    return React.createElement(ProjspecPanelComponent, {
      path: this._currentPath,
      expandedSpecName: this._expandedSpecName,
      expandRequestId: this._expandRequestId,
      scanRevision: this._scanRevision,
      onCreateProject: this._onCreateProject ?? undefined
    });
  }
}
