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

  constructor() {
    super();
    this.addClass(PANEL_CLASS);
    this.id = 'projspec-panel';
    this.title.label = 'Project Spec';
    this.title.closable = true;
    this._currentPath = '';
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
      this.update();
    }
  }

  /**
   * Render the React component.
   */
  render(): React.ReactElement {
    return React.createElement(ProjspecPanelComponent, {
      path: this._currentPath
    });
  }
}
