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

  constructor() {
    super();
    this.addClass(PANEL_CLASS);
    this.id = 'projspec-panel';
    this.title.caption = 'Project Spec';
    this.title.closable = true;
    this._currentPath = '';
    this._expandedSpecName = null;
    this._expandRequestId = 0;
  }

  /**
   * Get the current path being displayed.
   */
  get currentPath(): string {
    return this._currentPath;
  }

  /**
   * Update the displayed path and trigger a re-render.
   * @param path - The new path to scan.
   */
  updatePath(path: string): void {
    if (this._currentPath !== path) {
      this._currentPath = path;
      // Clear expanded spec when path changes
      this._expandedSpecName = null;
      this.update();
    }
  }

  /**
   * Expand a specific spec by name and trigger a re-render.
   * @param specName - The spec name to expand (e.g., 'python_library').
   */
  expandSpec(specName: string): void {
    this._expandedSpecName = specName;
    // Increment request ID to ensure expansion triggers even if same spec is clicked
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
      expandRequestId: this._expandRequestId
    });
  }
}
