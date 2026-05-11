const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, shell, ipcMain } = require('electron');
const path = require('path');

// 1. 必须在 app ready 之前设置，尤其是在打包后
app.setAppUserModelId('com.tomato_clock.app'); 

let mainWindow = null;
let tray = null;
let isQuitting = false; // 标记是否主动退出应用，避免销毁后操作tray

function createWindow() {
  // 防止重复创建窗口
  if (mainWindow) return;

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, 
      contextIsolation: true 
    }
  });
  mainWindow.loadFile('index.html');
  
  // 隐藏窗口但保持运行
//   mainWindow.hide();

  // 优化窗口关闭逻辑：macOS下关闭窗口仅隐藏，不销毁
  mainWindow.on('close', (e) => {
    if (!isQuitting && process.platform === 'darwin') {
      e.preventDefault(); // 阻止窗口销毁
      mainWindow.hide(); // 仅隐藏窗口
    }
  });

  // 窗口销毁时清空引用，避免访问已销毁对象
  mainWindow.on('destroyed', () => {
    mainWindow = null;
  });
}

// --- 系统消息通知实现 (增强版) ---
function checkNotificationPermission() {
  if (!Notification.isSupported()) return 'unsupported';
  if (Notification.permission) {
    return Notification.permission; // 返回 'granted'/'denied'/'default'
  }
  return 'unknown';
}

function sendNotification() {
  try {
    console.log('开始发送通知');
    if (!Notification.isSupported()) {
      console.error('当前系统不支持通知功能');
      return;
    }
    const perm = checkNotificationPermission();
    if (perm === 'denied' || perm === 'unknown') {
      console.error('通知权限被拒绝，请手动开启');
      return;
    }
    if (perm === 'default') {
      console.log('首次请求通知权限...');
    }
    console.log('通知权限检测：', Notification.permission);

    const notification = new Notification({
      title: '应用通知',
      body: '这是一条来自 Mac 状态栏应用的系统消息！',
      silent: false, 
    });
    
    notification.on('click', () => {
      console.log('通知被点击了');
      if (mainWindow) { // 先检查窗口引用是否存在
        mainWindow.show();
      } else {
        createWindow(); // 窗口销毁后重新创建
        mainWindow.show();
      }
    });

    notification.show();
    console.log('通知已成功发送');
  } catch (err) {
    console.error('发送通知失败:', err);
  }
}

function createTray() {
  // 防止重复创建tray
  if (tray) return;

// 定义图标路径
  let iconPath = path.join(__dirname, 'assets/icon.png'); // 默认图标
  const alertIconPath = path.join(__dirname, 'assets/icon-alert.png'); // 带红点的图标
  
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
// 【修复点 2】显式再次设置一次图标，确保初始状态生效
  tray.setImage(icon);

  // --- 新增：监听来自渲染进程的红点状态切换 ---
  ipcMain.on('set-tray-alert', (event, isAlert) => {
    if (!tray) {
        console.error('tray 未初始化，无法设置红点状态');
        return;
    }
    
    if (isAlert) {
      console.log('设置红点图标');
      const alertIcon = nativeImage.createFromPath(alertIconPath);
      if (!alertIcon.isEmpty()) {
        tray.setToolTip('时间到！请休息');
        tray.setImage(alertIcon);
      }
    } else {
      console.log('设置正常图标');
      const normalIcon = nativeImage.createFromPath(iconPath);
      if (!normalIcon.isEmpty()) {
        tray.setToolTip('我的应用');
        tray.setImage(normalIcon);
      }
    }
  });

  const contextMenu = Menu.buildFromTemplate([
    { 
      label: '显示应用', 
      click: () => { 
        if (mainWindow) {
          mainWindow.show();
        } else {
          createWindow();
          mainWindow.show();
        }
      } 
    },
    { 
      label: '发送测试通知', 
      click: () => { 
        console.log('执行通知点击事件');
        sendNotification(); 
      } 
    },
    { type: 'separator' },
    { 
      label: '退出', 
      click: () => { 
        isQuitting = true; // 标记为主动退出
        app.quit(); // 确保完全退出应用
      } 
    }
  ]);

  tray.setToolTip('我的应用');
  tray.setContextMenu(contextMenu);
  
  // 添加 tray 点击事件的监听（核心修复：先检查tray和窗口是否存在）
  tray.on('click', () => {
    // 防止tray已销毁后触发事件
    if (!tray) return;
    console.log('Tray 被点击');
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    } else {
      createWindow();
      mainWindow.show();
    }
  });
}

// 应用就绪逻辑
app.whenReady().then(() => {
  console.log('App is ready, creating window and tray');
  createWindow();
  createTray();

  // 检查通知权限（移到whenReady中，避免重复监听ready事件）
  if (Notification.isSupported()) {
    console.log('通知功能可用');
  } else {
    console.log('通知功能不可用');
  }
});

// 所有窗口关闭时的逻辑（优化macOS行为）
app.on('window-all-closed', () => {
  // macOS下保持应用运行，其他平台退出
  if (process.platform !== 'darwin') {
    isQuitting = true;
    app.quit();
  }
});

// 应用激活事件（macOS Dock点击）
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (mainWindow) {
    mainWindow.show(); // 激活时显示窗口
  }
});

// 应用即将退出：标记状态+清理资源
app.on('before-quit', () => {
  console.log('应用即将退出，进行清理...');
  isQuitting = true; // 标记为退出状态，让close事件正常执行
});

// 应用即将退出：清理tray
app.on('will-quit', () => {
  console.log('应用即将退出');
  // 清理tray前先检查是否存在，避免访问已销毁对象
  if (tray) {
    tray.destroy();
    tray = null; // 清空引用
  }
});