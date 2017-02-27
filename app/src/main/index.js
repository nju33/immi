'use strict'

import fs from 'fs';
import path from 'path';
import {app, BrowserWindow, Tray, Menu, ipcMain} from 'electron';
import imagemin from 'imagemin';
import imageminMozjpeg from 'imagemin-mozjpeg';
import imageminPngquant from 'imagemin-pngquant';
import imageminGifsicle from 'imagemin-gifsicle';
import del from 'del';
import ulid from 'ulid';

let mainWindow;
let tray = null;
let trayWindow = null;
const winURL = process.env.NODE_ENV === 'development'
  ? `http://localhost:${require('../../../config').port}`
  : `file://${__dirname}/index.html`

function createWindow(url) {
  const bounds = tray.getBounds();
  trayWindow = new BrowserWindow({
    width: 250,
    height: 100,
    x: bounds.x - 108,
    y: 10,
    frame: false,
    movable: false,
    resizable: false,
    closable: false,
    alwaysOnTop: true,
    fullscreenable: false
  });
  trayWindow.loadURL(url);
  return trayWindow;
}

function isImage(filename) {
  return /(?:\.svg|\.png|\.jpg|\.jpeg|\.gif)$/.test(filename);
}

function createTray() {
  if (tray !== null) {
    return tray;
  }

  tray = new Tray(path.join(__dirname, 'images/tray.png'));
  tray.setToolTip('Share On');
  tray.setContextMenu(Menu.buildFromTemplate([
    // {
    //   label: 'Performance',
    //   click() {
    //     console.log(1);
    //   }
    // },
    // {type: 'separator'},
    {
      label: 'Quit',
      click() {
        app.quit();
      }
    }
  ]))
  tray.on('drop-files', (e, filepaths) => {
    let error = false;

    if (trayWindow !== null) {
      return;
    }

    if (!filepaths.every(p => isImage(p))) {
      const code = '';
      const msg = 'contains files other than [.png, .jpg, .jpeg, .gif, .svg]';
      trayWindow = createWindow(`${winURL}?error&code=${code}&msg=${msg}`);
      return;
    }

    const dirpath = path.dirname(filepaths[0]);
    const originalDirpath = path.join(dirpath, 'original');

    try {
      fs.accessSync(originalDirpath, fs.constants.F_OK);
    } catch (err) {
      fs.mkdirSync(originalDirpath);
    }

    const originalFilepaths = filepaths.map(filepath => {
      const filename = path.basename(filepath);
      const originalFilepath = path.join(originalDirpath, filename);
      fs.createReadStream(filepath)
        .pipe(fs.createWriteStream(originalFilepath))
        .on('error', err => {
          const code = '';
          const msg = err.message;
          trayWindow = createWindow(`${winURL}?error&code=${code}&msg=${msg}`);
          error = true;
        });
      return originalFilepath;
    });

    if (error) {
      return;
    }

    imagemin(originalFilepaths, dirpath, {
      plugins: [
        imageminMozjpeg({targa: true}),
        imageminPngquant({quality: '65-80'}),
        imageminGifscale()
      ]
    })
    .then(files => {
      const msg = 'Complate!';
      trayWindow = createWindow(`${winURL}?success&msg=${msg}`);
      const _ulid = ulid();
      trayWindow.ulid = _ulid;
      setTimeout(() => {
        if (trayWindow !== null && trayWindow.ulid === _ulid) {
          trayWindow.destroy();
          trayWindow = null;
        }
      }, 5000);
    })
    .catch(err => {
      const code = '';
      const msg = err.message;
      trayWindow = createWindow(`${winURL}?error&code=${code}&msg=${msg}`);
      del(path.join(originalDirpath, originalFilepaths.map(f => (
        path.basename(f)
      ))), {force: true});
    });
  });
}

// let win = null;
app.on('ready', () => {
  // win = new BrowserWindow({
  //   x: 0,
  //   y: 0,
  //   width: 250,
  //   height: 100,
  //   frame: false
  // });
  // win.loadURL(winURL);
  app.dock.hide();
  createTray();
});

ipcMain.on('close-window', () => {
  if (trayWindow !== null) {
    trayWindow.destroy();
    trayWindow = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
