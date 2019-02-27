import { BrowserWindow, ipcMain } from 'electron';
import isDev from 'electron-is-dev';
import * as path from 'path';
import GoogleTranslate from '../services/google-translate/google-translate.service';
import { electronConfig } from './../electron.config';
import ClipboardService from './../services/clipboard/clipboard.service';
import GoogleOAuth2Service from './../services/oauth2/google-oauth2.service';

let mainWindow: Electron.BrowserWindow = null;

const signinWithGoogle = () => {
  const googleOAuth2Service = new GoogleOAuth2Service(
    electronConfig.googleOAuth2
  );

  // This method will be called when oatuh-tokens have been refreshed
  googleOAuth2Service.on('tokens', authTokens =>
    mainWindow.webContents.send('oauth2tokens-refresh', authTokens)
  );

  // Initialize oatuh2 credentials
  ipcMain.on('oauth2tokens', async (event, authTokens) =>
    authTokens
      ? googleOAuth2Service.setCredentials(authTokens)
      : googleOAuth2Service.openAuthWindowAndSetCredentials()
  );

  // This method will be called when Angular client has been loaded
  ipcMain.on('client-load', () => {
    mainWindow.webContents.send(
      'oauth2-client',
      googleOAuth2Service.getOAuth2Client()
    );
  });
};

const handleClipboard = () => {
  const clipboardService = new ClipboardService();

  clipboardService.on('clipboard-change', clipboard =>
    mainWindow.webContents.send('clipboard-change', clipboard)
  );
};

const initGoogleTranslate = () => {
  const googleTranslate = new GoogleTranslate();

  ipcMain.on('google-translate-query', async (event, { text, options }) => {
    try {
      const result = await googleTranslate.translate(text, options);
      mainWindow.webContents.send('google-translate-result', result);
    } catch (error) {
      console.error('google translate error - ', error);
    }
  });
};

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    height: 600,
    width: 800,
    frame: isDev ? true : false
  });

  console.error('Directory', __dirname, isDev);

  // and load the index.html of the app. try -> loadURL(`file://${__dirname}/index.html`)
  mainWindow.loadURL(
    isDev
      ? 'http://localhost:4200'
      : path.join(`file://${__dirname}`, '../../index.html')
  );

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  mainWindow.webContents.once('did-finish-load', () => {
    handleClipboard();
  });

  signinWithGoogle();

  initGoogleTranslate();

  // Emitted when the window is closed.
  mainWindow.on('closed', () => (mainWindow = null));
};

export const isAvailable = () => !!mainWindow;
export default {
  createWindow
};
