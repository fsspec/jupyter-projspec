import React from 'react';
import { ReactWidget } from '@jupyterlab/ui-components';
import { ProjspecPanelComponent } from '../components';
import { ScanSource, scanSourcesEqual } from '../types';

const PANEL_CLASS = 'jp-projspec-Panel';

/**
 * Right-sidebar widget that displays projspec information for the currently
 * active file browser directory (local or jupyter-fs).
 *
 * Starts with no scan source (null); the plugin sets the real source after
 * the app layout is restored.
 */
export class ProjspecPanel extends ReactWidget {
  private _scanSource: ScanSource | null;
  private _expandedSpecName: string | null;
  private _expandRequestId: number;

  constructor() {
    super();
    this.addClass(PANEL_CLASS);
    this.id = 'projspec-panel';
    this.title.caption = 'Project Spec';
    this.title.closable = true;
    this._scanSource = null;
    this._expandedSpecName = null;
    this._expandRequestId = 0;
  }

  get scanSource(): ScanSource | null {
    return this._scanSource;
  }

  /**
   * Set the scan source and trigger a re-render.
   * No-ops when the new source is value-equal to the current one.
   */
  updateSource(source: ScanSource): void {
    if (!scanSourcesEqual(this._scanSource, source)) {
      this._scanSource = source;
      this._expandedSpecName = null;
      this.update();
    }
  }

  /**
   * Expand a specific spec by name (e.g. 'python_library').
   */
  expandSpec(specName: string): void {
    this._expandedSpecName = specName;
    this._expandRequestId++;
    this.update();
  }

  render(): React.ReactElement {
    return React.createElement(ProjspecPanelComponent, {
      scanSource: this._scanSource,
      expandedSpecName: this._expandedSpecName,
      expandRequestId: this._expandRequestId
    });
  }
}
