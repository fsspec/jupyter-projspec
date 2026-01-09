import { FileBrowser } from '@jupyterlab/filebrowser';
import { ReactWidget } from '@jupyterlab/ui-components';
import React from 'react';
import { ProjspecChips } from '../components/ProjspecChips';

/**
 * CSS class for the projspec chips widget in the file browser.
 */
const WIDGET_CLASS = 'jp-projspec-ChipsWidget';

/**
 * A widget that displays projspec type chips in the file browser.
 * Clicking a chip opens the sidebar panel with full projspec details.
 */
export class ProjspecChipsWidget extends ReactWidget {
  private _currentPath: string;
  private _onChipClick: (specName: string) => void;

  /**
   * Create a new ProjspecChipsWidget.
   * @param fileBrowser - The file browser instance to sync with.
   * @param onChipClick - Callback when a chip is clicked.
   */
  constructor(
    fileBrowser: FileBrowser,
    onChipClick: (specName: string) => void
  ) {
    super();
    this._currentPath = fileBrowser.model.path;
    this._onChipClick = onChipClick;
    this.addClass(WIDGET_CLASS);

    // Listen to path changes and re-render
    fileBrowser.model.pathChanged.connect((_, changedArgs) => {
      this._updatePath(changedArgs.newValue);
    });
  }

  /**
   * Update the displayed path and trigger a re-render.
   */
  private _updatePath(path: string): void {
    if (this._currentPath !== path) {
      this._currentPath = path;
      this.update();
    }
  }

  /**
   * Handle visibility change from the React component.
   * Shows or hides the widget container based on whether there are specs.
   */
  private _handleVisibilityChange = (visible: boolean): void => {
    if (visible) {
      this.removeClass('jp-projspec-ChipsWidget-hidden');
    } else {
      this.addClass('jp-projspec-ChipsWidget-hidden');
    }
  };

  /**
   * Render the React component.
   */
  render(): React.ReactElement {
    return React.createElement(ProjspecChips, {
      path: this._currentPath,
      onChipClick: this._onChipClick,
      onVisibilityChange: this._handleVisibilityChange
    });
  }
}
