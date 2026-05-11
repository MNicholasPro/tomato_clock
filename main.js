const { app, BrowserWindow, Tray, Menu, Notification, nativeImage } = require('electron');
const path = require('path');

let mainWindow;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    // 隐藏 Dock 图标 (如果希望应用纯粹在状态栏运行，取消下面注释)
    // skipTaskbar: true, 
    webPreferences: {
      preload: path.join(__dirname, 'renderer.js'), // 确保 preload 路径正确
      nodeIntegration: false, 
      contextIsolation: true 
    }
  });

  mainWindow.loadFile('index.html');

  // macOS 特有：点击 Dock 图标时聚焦窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

// --- 状态栏 Tray 实现 ---
function createTray() {
  // 注意：你需要准备一个 16x16 或 22x22 的图标文件 (icon.png)
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets/icon.png')); 
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示应用', click: () => { mainWindow.show(); } },
    { label: '发送测试通知', click: () => sendNotification() },
    { type: 'separator' },
    { label: '退出', click: () => { app.quit(); } }
  ]);

  tray.setToolTip('我的应用');
  tray.setContextMenu(contextMenu);

  // 点击图标显示/隐藏窗口
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

// --- 系统消息通知实现 ---
function sendNotification() {
  new Notification({
    title: '应用通知',
    body: '这是一条来自 Mac 状态栏应用的系统消息！',
    silent: false, 
  }).show();
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

// 确保所有窗口关闭后退出 (macOS 习惯是保持运行)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});