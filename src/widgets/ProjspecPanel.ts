import { Widget } from '@lumino/widgets';

/**
 * CSS class for the projspec panel widget.
 */
const PANEL_CLASS = 'jp-projspec-Panel';

/**
 * A widget that displays projspec information for the current directory.
 */
export class ProjspecPanel extends Widget {
  private _pathElement: HTMLElement;
  private _currentPath: string;

  constructor() {
    super();
    this.addClass(PANEL_CLASS);
    this.id = 'projspec-panel';
    this.title.label = 'Project Spec';
    this.title.closable = true;
    this._currentPath = '';

    // Create the panel content
    const content = document.createElement('div');
    content.className = 'jp-projspec-Panel-content';

    // Create header
    const header = document.createElement('div');
    header.className = 'jp-projspec-Panel-header';
    header.textContent = 'Current Directory';
    content.appendChild(header);

    // Create path display element
    this._pathElement = document.createElement('div');
    this._pathElement.className = 'jp-projspec-Panel-path';
    this._pathElement.textContent = 'No directory selected';
    content.appendChild(this._pathElement);

    this.node.appendChild(content);
  }

  /**
   * Get the current path being displayed.
   */
  get currentPath(): string {
    return this._currentPath;
  }

  /**
   * Update the displayed path.
   * @param path - The new path to display.
   */
  updatePath(path: string): void {
    this._currentPath = path;
    if (path === '' || path === '/') {
      this._pathElement.textContent = '/ (root)';
    } else {
      this._pathElement.textContent = path;
    }
  }
}

