const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, shell } = require('electron');
const path = require('path');

// 1. 必须在 app ready 之前设置，尤其是在打包后
app.setAppUserModelId('com.tomato_clock.app'); 

let mainWindow;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'renderer.js'),
      nodeIntegration: false, 
      contextIsolation: true 
    }
  });
  mainWindow.loadFile('index.html');
}

// --- 系统消息通知实现 (增强版) ---
function checkNotificationPermission() {
  if (!Notification.isSupported()) return 'unsupported';
  // Electron 14+ 支持直接获取权限状态
  if (Notification.permission) {
    return Notification.permission; // 返回 'granted'/'denied'/'default'
  }
  // 兼容旧版 Electron：引导用户手动打开设置
  return 'unknown';
}
function sendNotification() {
  try {
    console.log('开始发送通知'); // 新增：确认函数进入
    // 检查是否支持通知
    if (!Notification.isSupported()) {
      console.error('当前系统不支持通知功能');
      return;
    }
    const perm = checkNotificationPermission();
    if (perm === 'denied' || perm === 'unknown') {
      console.error('通知权限被拒绝，请手动开启');
      // 引导用户打开系统通知设置
    //   shell.openExternal('x-apple.systempreferences:com.apple.preference.notifications');
      return;
    }
    if (perm === 'default') {
      console.log('首次请求通知权限...');
    }
    console.log('通知权限检测：', Notification.permission); // 新增：打印权限状态

    const notification = new Notification({
      title: '应用通知',
      body: '这是一条来自 Mac 状态栏应用的系统消息！',
      silent: false, 
    });
    
    notification.on('click', () => {
      console.log('通知被点击了');
      mainWindow.show();
    });

    notification.show();
    console.log('通知已成功发送');
  } catch (err) {
    console.error('发送通知失败:', err);
  }
}

function createTray() {
  // 优先使用 .icns 格式图标
  let iconPath = path.join(__dirname, 'assets/icon.icns');
  let icon = nativeImage.createFromPath(iconPath);
  
  // 如果 .icns 不存在，回退到 .png
  if (icon.isEmpty()) {
    iconPath = path.join(__dirname, 'assets/icon.png');
    icon = nativeImage.createFromPath(iconPath);
  }
  
  // 检查图标是否加载成功
  if (icon.isEmpty()) {
    console.error('无法加载状态栏图标，请检查 assets/icon.icns 或 assets/icon.png 路径');
    return;
  }

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示应用', click: () => { mainWindow.show(); } },
    { label: '发送测试通知', click: () => { 
        console.log('执行通知点击事件');
        sendNotification(); 
      } 
    },
    { type: 'separator' },
    { label: '退出', click: () => { app.quit(); } }
  ]);

  tray.setToolTip('我的应用');
  tray.setContextMenu(contextMenu);
  
  // 添加 tray 点击事件的监听
  tray.on('click', () => {
    console.log('Tray 被点击');
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

app.whenReady().then(() => {
  console.log('App is ready, creating window and tray');
  createWindow();
  createTray();
});

// 确保所有窗口关闭后退出 (macOS 习惯是保持运行)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 应用激活事件
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// 检查通知权限
app.on('ready', () => {
  // 在应用启动后检查通知权限
  if (Notification.isSupported()) {
    console.log('通知功能可用');
  } else {
    console.log('通知功能不可用');
  }
});