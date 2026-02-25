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
  /** The specific breadcrumb element we are watching, if found. */
  private _crumbsEl: Element | null = null;
  /** Pending re-read timer after a breadcrumb detachment. */
  private _rereadTimer: ReturnType<typeof setTimeout> | null = null;

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

      if (this._crumbsEl && !this._crumbsEl.isConnected) {
        this._crumbsEl = null;
        this._observeSidebar();

        // tree-finder replaces the breadcrumb element and populates its text
        // asynchronously — schedule a re-read so we pick up the new path once
        // the replacement element's content has been rendered.
        this._scheduleReread();
        return;
      }

      if (!this._crumbsEl) {
        this._narrowToCrumbs();
      }

      this._syncBreadcrumb();
    });

    this._observeSidebar();
    this._narrowToCrumbs();
  }

  dispose(): void {
    if (this._rereadTimer !== null) {
      clearTimeout(this._rereadTimer);
      this._rereadTimer = null;
    }
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    this._sidebar = null;
    this._onNavigate = null;
    super.dispose();
  }

  /**
   * Start observing the full sidebar for structural changes (childList).
   * This ensures we detect when tree-finder replaces the breadcrumb element.
   */
  private _observeSidebar(): void {
    this._observer?.disconnect();
    if (this._sidebar) {
      this._observer?.observe(this._sidebar, {
        childList: true,
        subtree: true
      });
    }
  }

  /**
   * Additionally observe the breadcrumb element for text changes.
   * MutationObserver.observe() *adds* targets, so the sidebar observation
   * from _observeSidebar() remains active.
   */
  private _narrowToCrumbs(): void {
    if (!this._sidebar) {
      return;
    }
    const crumbs = this._sidebar.querySelector('.tf-panel-breadcrumbs');
    if (crumbs) {
      this._crumbsEl = crumbs;
      this._observer?.observe(crumbs, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
  }

  /**
   * Schedule a deferred breadcrumb re-read.  tree-finder populates the
   * replacement breadcrumb element asynchronously, so we wait one task
   * before reading.
   */
  private _scheduleReread(): void {
    if (this._rereadTimer !== null) {
      clearTimeout(this._rereadTimer);
    }
    this._rereadTimer = setTimeout(() => {
      this._rereadTimer = null;
      this._narrowToCrumbs();
      this._syncBreadcrumb();
    }, 0);
  }

  /**
   * Read the current breadcrumb path and update state if it has changed.
   */
  private _syncBreadcrumb(): void {
    if (!this._sidebar) {
      return;
    }

    const newPath = readBreadcrumbPath(this._sidebar);
    if (newPath !== this._subpath) {
      this._subpath = newPath;
      this._onNavigate?.(newPath);
      this.update();
    }
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
