import { Token } from '@lumino/coreutils';
import { ProjspecPanel } from './widgets/ProjspecPanel';

/**
 * Shared state provided by the main plugin and consumed by the jupyter-fs
 * integration plugin. Using a JupyterLab Token guarantees activation order
 * and makes the cross-plugin dependency explicit and type-safe.
 */
export interface IProjspecPanelProvider {
  panel: ProjspecPanel;
  sidebarIdToUrl: Map<string, string>;
  syncPanelToActiveTab: (force?: boolean) => void;
}

export const IProjspecPanelProvider = new Token<IProjspecPanelProvider>(
  'jupyter-projspec:IProjspecPanelProvider'
);
