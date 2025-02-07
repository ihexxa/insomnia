import { autoUpdater, BrowserWindow, ipcMain, Notification } from 'electron';

import {
  CHECK_FOR_UPDATES_INTERVAL,
  getAppId,
  getAppVersion,
  isDevelopment,
  UpdateURL,
} from '../common/constants';
import { delay } from '../common/misc';
import * as models from '../models/index';
import { invariant } from '../utils/invariant';
import { exportAllWorkspaces } from './export';
const isUpdateSupported = () => {
  if (process.platform === 'linux') {
    console.log('[updater] Not supported on this platform', process.platform);
    return false;
  }
  if (process.platform === 'win32' && process.env['PORTABLE_EXECUTABLE_DIR']) {
    console.log('[updater] Not supported on portable windows binary');
    return false;
  }
  if (process.env.INSOMNIA_DISABLE_AUTOMATIC_UPDATES) {
    console.log('[updater] Disabled by INSOMNIA_DISABLE_AUTOMATIC_UPDATES environment variable');
    return false;
  }
  if (isDevelopment()) {
    console.log('[updater] Disabled in dev mode');
    return false;
  }
  return true;
};
const getUpdateUrl = (updateChannel: string): string | null => {
  invariant(isUpdateSupported(), 'auto update is not supported');
  const fullUrl = new URL(process.platform === 'win32' ? UpdateURL.windows : UpdateURL.mac);
  fullUrl.searchParams.append('v', getAppVersion());
  fullUrl.searchParams.append('app', getAppId());
  fullUrl.searchParams.append('channel', updateChannel);
  console.log(`[updater] Using url ${fullUrl.toString()}`);
  return fullUrl.toString();
};

const _sendUpdateStatus = (status: string) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('updaterStatus', status);
  }
};

export const init = async () => {
  autoUpdater.on('error', error => {
    console.warn(`[updater] Error: ${error.message}`);
    _sendUpdateStatus('Update Error');
  });
  autoUpdater.on('update-not-available', () => {
    console.log('[updater] Not Available');
    _sendUpdateStatus('Up to Date');
  });
  autoUpdater.on('update-available', () => {
    console.log('[updater] Update Available');
    _sendUpdateStatus('Downloading...');
  });
  autoUpdater.on('update-downloaded', async (_error, _releaseNotes, releaseName) => {
    console.log(`[updater] Downloaded ${releaseName}`);
    _sendUpdateStatus('Performing backup...');
    await exportAllWorkspaces();
    await delay(1000 * 10); // Workaround early restart issues
    _sendUpdateStatus('Updated (Restart Required)');

    setTimeout(() => {
      console.log('[app] Update Downloaded and ready to install over existing app');
      new Notification({
        title: 'Insomnia Update Ready',
        body: 'Relaunch the app for it to take effect',
        silent: true,
      }).show();
    }, 1000 * 2);
  });

  if (isUpdateSupported()) {
    // on app start
    const settings = await models.settings.getOrCreate();
    const updateUrl = getUpdateUrl(settings.updateChannel);
    if (settings.updateAutomatically && updateUrl) {
      _checkForUpdates(updateUrl);
    }
    // on an interval (3h)
    setInterval(async () => {
      const settings = await models.settings.getOrCreate();
      const updateUrl = getUpdateUrl(settings.updateChannel);
      if (settings.updateAutomatically && updateUrl) {
        _checkForUpdates(updateUrl);
      }
    }, CHECK_FOR_UPDATES_INTERVAL);

    // on check now button pushed
    ipcMain.on('manualUpdateCheck', async () => {
      console.log('[updater] Manual update check');
      const settings = await models.settings.getOrCreate();
      const updateUrl = isUpdateSupported() && getUpdateUrl(settings.updateChannel);
      if (!updateUrl) {
        _sendUpdateStatus('Updates Not Supported');
        return;
      }
      _sendUpdateStatus('Checking');
      await delay(300); // Pacing
      _checkForUpdates(updateUrl);
    });
  }
};

const _checkForUpdates = (updateUrl: string) => {
  try {
    console.log(`[updater] Checking for updates url=${updateUrl}`);
    autoUpdater.setFeedURL({ url: updateUrl });
    autoUpdater.checkForUpdates();
  } catch (err) {
    console.warn('[updater] Failed to check for updates:', err.message);
    _sendUpdateStatus('Update Error');
  }
};
