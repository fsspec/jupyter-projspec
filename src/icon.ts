import { LabIcon } from '@jupyterlab/ui-components';

import projspecIconSvgStr from '../style/projspec-icon.svg';

/**
 * The projspec extension icon.
 */
export const projspecIcon = new LabIcon({
  name: 'jupyter-projspec:logo',
  svgstr: projspecIconSvgStr
});
