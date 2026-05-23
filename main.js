const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, shell, ipcMain } = require('electron');
const { exec } = require('child_process');
const path = require('path');

// 1. 仅在 Windows 上设置应用 ID，macOS 使用 Bundle ID（在 package.json 中配置）
if (process.platform === 'win32') {
  app.setAppUserModelId('com.tomato_clock.app');
} else if (process.platform === 'darwin') {
  app.setName('TomatoClock');
}

let mainWindow = null;
let tray = null;
let isQuitting = false; // 标记是否主动退出应用，避免销毁后操作tray
let notification = null; // 保持通知对象引用，防止被垃圾回收

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

function sendNotification(title, bodyText) {
  try {
    console.log('\n========== 开始发送通知 ==========');
    console.log('标题:', title);
    console.log('内容:', bodyText);
    console.log('当前平台:', process.platform);

    if (Notification.isSupported()) {
      console.log('✅ Notification 支持，使用原生通知');
      console.log('Notification.permission:', Notification.permission);

      // 【关键修复】Electron 主进程中的 Notification 没有 requestPermission() 方法
      // 直接调用 doShowNotification，macOS 会自动处理权限请求
      doShowNotification(title, bodyText);
    } else {
      fallbackToOsascript(title, bodyText);
    }
    console.log('========== 通知发送完成 ==========\n');
  } catch (err) {
    console.error('❌ 发送通知异常:', err);
    fallbackToOsascript(title, bodyText);
  }
}

function fallbackToOsascript(title, bodyText) {
  if (process.platform === 'darwin') {
    try {
      console.log('📢 fallback: 使用 macOS osascript 发送通知...');
      const appleScript = `display notification "${bodyText}" with title "${title}"`;
      const child = exec(`osascript -e '${appleScript}'`);
      child.on('close', (code) => {
        if (code === 0) {
          console.log('✅ macOS 系统通知已发送成功');
        } else {
          console.error('❌ osascript 通知发送失败，退出码:', code);
          shell.beep();
        }
      });
    } catch (err) {
      console.error('❌ fallback 通知发送异常:', err.message);
      shell.beep();
    }
  }
}

function doShowNotification(title, bodyText) {
  notification = new Notification({
    title: title || '应用通知',
    body: bodyText || '这是一条来自应用的系统消息！',
    silent: false
  });

  notification.on('click', () => {
    console.log('📍 通知被点击');
    if (mainWindow) {
      mainWindow.show();
    }
  });

  notification.show();
  console.log('✅ 原生通知已显示');
}

// 【确保此处的字符串与 preload.js 中的 send 参数一致】
ipcMain.on('trigger-completion-notification', (event, data) => {
  console.log('\n📨 【IPC】收到 trigger-completion-notification 消息');
  console.log('数据:', data);
  if (data && data.title && data.message) {
    sendNotification(data.title, data.message);
  } else {
    console.error('❌ 数据格式错误:', data);
  }
});


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

  // 检查通知功能
  console.log('Notification.isSupported():', Notification.isSupported());
  console.log('Notification.permission:', Notification.permission);
  if (Notification.isSupported()) {
    console.log('通知功能支持');
    // 主动请求通知权限（macOS 10.14+ 需要在 Info.plist 中声明权限描述）
    requestNotificationPermission();
  } else {
    console.warn('当前系统不支持原生通知');
  }
});

// 主动请求通知权限（主进程中不能调用 requestPermission，直接显示测试通知触发权限请求）
function requestNotificationPermission() {
  if (Notification.permission === 'granted') {
    console.log('✅ 通知权限已授予');
  } else if (Notification.permission === 'denied') {
    console.warn('❌ 通知权限已被拒绝');
    console.warn('请手动在 系统设置 > 通知 中为 TomatoClock 开启通知');
  } else {
    // 【关键修复】Electron 主进程中没有 requestPermission() 方法
    // 在 macOS 上，直接显示通知会自动触发系统权限请求弹窗
    console.log('📢 主进程中无法调用 requestPermission，将在首次发送通知时自动触发权限请求');
  }
}

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