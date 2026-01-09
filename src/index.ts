import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';

import { projspecIcon } from './icon';
import { ProjspecPanel } from './widgets/ProjspecPanel';

/**
 * The plugin ID for jupyter-projspec.
 */
const PLUGIN_ID = 'jupyter-projspec:plugin';

/**
 * Initialization data for the jupyter-projspec extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: 'A Jupyter interface for projspec',
  autoStart: true,
  requires: [IDefaultFileBrowser],
  optional: [ILayoutRestorer],
  activate: (
    app: JupyterFrontEnd,
    fileBrowser: IDefaultFileBrowser,
    restorer: ILayoutRestorer | null
  ) => {
    // Create the projspec panel widget
    const panel = new ProjspecPanel();
    panel.title.icon = projspecIcon;

    // Function to update the panel with the current path
    const updatePath = () => {
      const path = fileBrowser.model.path;
      panel.updatePath(path);
    };

    // Set initial path
    updatePath();

    // Subscribe to path changes in the file browser
    fileBrowser.model.pathChanged.connect(updatePath);

    // Add the panel to the right sidebar
    app.shell.add(panel, 'right', { rank: 1000 });

    // Restore the widget state if a restorer is available
    if (restorer) {
      restorer.add(panel, 'projspec-panel');
    }
  }
};

export default plugin;
