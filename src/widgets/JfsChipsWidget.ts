import { ReactWidget } from '@jupyterlab/ui-components';
import React from 'react';
import { ProjspecChips } from '../components/ProjspecChips';

/**
 * CSS class for the projspec chips widget in jupyter-fs sidebars.
 */
const JFS_WIDGET_CLASS = 'jp-projspec-JfsChipsWidget';

/**
 * CSS class for the container injected into a jupyter-fs sidebar.
 */
export const JFS_CHIPS_CONTAINER_CLASS = 'jp-projspec-jfs-chips-container';

/**
 * Read the current subpath from a tree-finder sidebar's breadcrumbs.
 * The breadcrumb element has class `tf-panel-breadcrumbs` and contains
 * the current path as its textContent (e.g., "/data-pipeline/src").
 */
export function readBreadcrumbPath(sidebar: Element): string {
  const crumbs = sidebar.querySelector('.tf-panel-breadcrumbs');
  if (!crumbs) {
    return '';
  }
  const raw = (crumbs.textContent ?? '').trim();
  // Normalize: strip leading slash, trim
  return raw.replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * A widget that displays projspec type chips inside a jupyter-fs sidebar.
 * Uses the `/scan-url` endpoint with the resource's fsspec URL.
 *
 * Observes the sidebar's breadcrumb path to update chips when the user
 * navigates to a different directory within the resource.
 */
export class JfsChipsWidget extends ReactWidget {
  private _scanUrl: string;
  private _subpath: string;
  private _onChipClick: (specName: string, subpath: string) => void;
  private _onNavigate: ((subpath: string) => void) | null;
  private _observer: MutationObserver | null = null;
  private _sidebar: Element | null = null;
  private _boundToCrumbs = false;

  /**
   * @param scanUrl - The fsspec URL for this jupyter-fs resource.
   * @param sidebar - The sidebar DOM element (used to watch breadcrumb changes).
   * @param onChipClick - Callback when a chip is clicked, receives the spec name and current subpath.
   * @param onNavigate - Optional callback when the breadcrumb path changes (directory navigation).
   */
  constructor(
    scanUrl: string,
    sidebar: Element,
    onChipClick: (specName: string, subpath: string) => void,
    onNavigate?: (subpath: string) => void
  ) {
    super();
    this._scanUrl = scanUrl;
    this._onChipClick = onChipClick;
    this._onNavigate = onNavigate ?? null;
    this._sidebar = sidebar;
    this._subpath = readBreadcrumbPath(sidebar);
    this.addClass(JFS_WIDGET_CLASS);

    this._observer = new MutationObserver(() => {
      if (!this._sidebar) {
        return;
      }
      const crumbs = this._sidebar.querySelector('.tf-panel-breadcrumbs');
      if (!crumbs) {
        return;
      }
      if (!this._boundToCrumbs) {
        this._boundToCrumbs = true;
        const obs = this._observer;
        if (!obs) {
          return;
        }
        obs.disconnect();
        obs.observe(crumbs, {
          childList: true,
          subtree: true,
          characterData: true
        });
      }
      const newPath = readBreadcrumbPath(this._sidebar);
      if (newPath !== this._subpath) {
        this._subpath = newPath;
        this._onNavigate?.(newPath);
        this.update();
      }
    });

    const crumbs = sidebar.querySelector('.tf-panel-breadcrumbs');
    if (crumbs) {
      this._boundToCrumbs = true;
      this._observer.observe(crumbs, {
        childList: true,
        subtree: true,
        characterData: true
      });
    } else {
      this._observer.observe(sidebar, { childList: true, subtree: true });
    }
  }

  dispose(): void {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    this._sidebar = null;
    this._onNavigate = null;
    super.dispose();
  }

  /**
   * Hide/show the widget based on whether specs are found.
   */
  private _handleVisibilityChange = (visible: boolean): void => {
    if (visible) {
      this.removeClass('jp-projspec-ChipsWidget-hidden');
    } else {
      this.addClass('jp-projspec-ChipsWidget-hidden');
    }
  };

  render(): React.ReactElement {
    const subpath = this._subpath;
    return React.createElement(ProjspecChips, {
      path: subpath,
      scanUrl: this._scanUrl,
      onChipClick: (specName: string) => this._onChipClick(specName, subpath),
      onVisibilityChange: this._handleVisibilityChange
    });
  }
}
