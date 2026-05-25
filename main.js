const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, shell, ipcMain } = require('electron');
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
  
  // 确保窗口创建成功后再设置事件监听器
  mainWindow.loadFile('index.html');
  
  // 窗口关闭事件处理（统一处理所有平台）
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // 窗口销毁时清空引用
  mainWindow.on('destroyed', () => {
    mainWindow = null;
  });
}

// --- 系统消息通知实现 (优化版) ---
function checkNotificationPermission() {
  if (!Notification.isSupported()) return 'unsupported';
  return Notification.permission || 'default'; // Electron 主进程可能返回 undefined
}

function sendNotification(title, bodyText) {
  try {
    console.log('\n========== 开始发送通知 ==========');
    console.log('标题:', title);
    console.log('内容:', bodyText);
    console.log('当前平台:', process.platform);

    const permission = checkNotificationPermission();
    console.log('通知权限状态:', permission);

    // 检查权限状态
    if (permission === 'denied') {
      console.warn('⚠️ 通知权限已被拒绝');
      console.warn('请在 系统设置 > 通知 中为 TomatoClock 开启通知权限');
      fallbackToOsascript(title, bodyText);
      return;
    }

    if (Notification.isSupported()) {
      console.log('✅ 使用 Electron 原生通知');
      
      // 先尝试原生通知
      const nativeSuccess = doShowNotification(title, bodyText);

      if (nativeSuccess) {
        console.log('✅ 原生通知成功');
        console.log('========== 通知发送流程结束 ==========\n');
        return;
      } else {
        console.log('⚠️ 原生通知失败');
      }
      
      // 如果原生通知可能失败，尝试fallback
      if (!nativeSuccess && process.platform === 'darwin') {
        console.log('🔄 原生通知可能未显示，尝试 fallback');
        fallbackToOsascript(title, bodyText);
      }
    } else {
      console.log('📢 Notification 不支持，使用 fallback');
      fallbackToOsascript(title, bodyText);
    }

    if (process.platform === 'darwin' && permission !== 'granted') {
      console.log('⚠️ macOS 上通知权限未知或未确认，使用 osascript fallback');
      fallbackToOsascript(title, bodyText);
    }

    console.log('========== 通知发送流程结束 ==========\n');
  } catch (err) {
    console.error('❌ 发送通知异常:', err);
    fallbackToOsascript(title, bodyText);
  }
}

function fallbackToOsascript(title, bodyText) {
  if (process.platform !== 'darwin') {
    console.log('⚠️ fallback 仅支持 macOS');
    return;
  }

  try {
    console.log('📢 使用 macOS osascript 发送通知...');
    
    // 【关键修复】正确转义特殊字符，防止命令注入和解析错误
    const escapedTitle = escapeAppleScriptString(title || '番茄时钟');
    const escapedBody = escapeAppleScriptString(bodyText || '时间到！');
    
    console.log('转义后标题:', escapedTitle);
    console.log('转义后内容:', escapedBody);

    // 构建AppleScript命令
    const appleScriptCode = `display notification "${escapedBody}" with title "${escapedTitle}" sound name "default"`;
    
    console.log('AppleScript代码:', appleScriptCode);
    
    // 使用spawn代替exec，更好地处理参数
    const { spawn } = require('child_process');
    const child = spawn('osascript', ['-e', appleScriptCode]);
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log('✅ osascript 通知发送成功');
        if (stdout) console.log('📝 osascript 输出:', stdout.trim());
      } else {
        console.error('❌ osascript 通知发送失败，退出码:', code);
        if (stderr) console.error('❌ osascript 错误:', stderr.trim());
        console.error('💡 可能需要在系统设置中允许 "终端" 发送通知');
        // 尝试另一种方法
        fallbackToTerminalNotifier(title, bodyText);
      }
    });
    
    child.on('error', (err) => {
      console.error('❌ osascript 执行错误:', err.message);
      fallbackToTerminalNotifier(title, bodyText);
    });
  } catch (err) {
    console.error('❌ fallback 通知发送异常:', err.message);
    fallbackToTerminalNotifier(title, bodyText);
  }
}

/**
 * 备用方案：使用terminal-notifier（如果安装的话）
 */
function fallbackToTerminalNotifier(title, bodyText) {
  console.log('🔄 尝试使用 terminal-notifier...');
  const { spawn } = require('child_process');
  const child = spawn('which', ['terminal-notifier']);
  
  child.stdout.on('data', (data) => {
    const path = data.toString().trim();
    if (path) {
      console.log('✅ 找到 terminal-notifier:', path);
      const notifier = spawn('terminal-notifier', [
        '-title', title || '番茄时钟',
        '-message', bodyText || '时间到！',
        '-sound', 'default'
      ]);
      
      notifier.on('close', (code) => {
        if (code === 0) {
          console.log('✅ terminal-notifier 通知发送成功');
        } else {
          console.error('❌ terminal-notifier 发送失败');
          shell.beep();
        }
      });
    } else {
      console.log('⚠️ terminal-notifier 未安装');
      shell.beep();
    }
  });
  
  child.on('error', () => {
    console.log('⚠️ 无法检查 terminal-notifier');
    shell.beep();
  });
}

/**
 * 转义 AppleScript 字符串中的特殊字符
 */
function escapeAppleScriptString(str) {
  if (!str) return '';
  // 正确转义：先转义反斜杠，再转义双引号、换行和回车
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

function doShowNotification(title, bodyText) {
  try {
    notification = new Notification({
      title: title || '番茄时钟',
      body: bodyText || '时间到！',
      silent: false,
      // 添加 sound 参数（某些Electron版本支持）
      sound: 'default'
    });

    notification.on('click', () => {
      console.log('📍 通知被点击');
      if (mainWindow) {
        mainWindow.show();
      }
    });

    notification.on('show', () => {
      console.log('✅ 原生通知已成功显示');
    });

    notification.on('error', (err) => {
      console.error('❌ 原生通知显示失败:', err);
      // 尝试 fallback
      fallbackToOsascript(title, bodyText);
    });

    notification.show();
    return true;
  } catch (err) {
    console.error('❌ 创建原生通知失败:', err);
    return false;
  }
}

// 【确保此处的字符串与 preload.js 中的 send 参数一致】
ipcMain.on('trigger-completion-notification', (event, data) => {
  console.log('\n📨 【IPC】收到 trigger-completion-notification 消息');
  console.log('数据类型:', typeof data);
  console.log('数据内容:', JSON.stringify(data, null, 2));
  
  // 验证数据
  if (!data) {
    console.error('❌ 数据为空');
    return;
  }
  
  const title = data.title || data.Title || '番茄时钟';
  const message = data.message || data.body || data.Message || '时间到！';
  
  console.log('提取的标题:', title);
  console.log('提取的消息:', message);
  
  sendNotification(title, message);
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

  // const contextMenu = Menu.buildFromTemplate([
  //   { 
  //     label: '显示应用', 
  //     click: () => { 
  //       if (mainWindow) {
  //         mainWindow.show();
  //       } else {
  //         createWindow();
  //         mainWindow.show();
  //       }
  //     } 
  //   },
  //   { 
  //     label: '发送测试通知', 
  //     click: () => { 
  //       console.log('执行通知点击事件');
  //       sendNotification(); 
  //     } 
  //   },
  //   { type: 'separator' },
  //   { 
  //     label: '退出', 
  //     click: () => { 
  //       isQuitting = true; // 标记为主动退出
  //       app.quit(); // 确保完全退出应用
  //     } 
  //   }
  // ]);

  tray.setToolTip('我的应用');
  // 修改 main.js 约 373 行开始的部分
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { 
        label: '显示 / 隐藏', 
        click: () => {
          // ✅ 将 win 修改为 mainWindow
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
          } else {
            createWindow();
            if (mainWindow) mainWindow.show();
          }
        } 
      },
      { 
        label: '退出', 
        click: () => {
          isQuitting = true; 
          app.quit();
        } 
      }
    ])
  );
  
  // 添加 tray 点击事件的监听（核心修复：先检查tray和窗口是否存在）
  tray.on('click', () => {
    if (!tray) return;
    console.log('Tray 被点击');
    
    // ✅ 更加安全的检查
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    } else {
      console.log('窗口已销毁或不存在，重新创建...');
      // 先清空引用，避免重复创建
      if (mainWindow) {
        mainWindow = null;
      }
      createWindow();
      // 确保创建成功后再显示
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
      }
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
  const permission = Notification.permission || 'default';
  if (permission === 'granted') {
    console.log('✅ 通知权限已授予');
  } else if (permission === 'denied') {
    console.warn('❌ 通知权限已被拒绝');
    console.warn('请手动在 系统设置 > 通知 中为 TomatoClock 开启通知');
  } else {
    // Electron 主进程没有 requestPermission() 方法。
    // macOS上，首次创建通知将触发系统权限请求弹窗。
    console.log('📢 通知权限尚未确认，将在首次发送通知时自动触发系统请求');
  }
}

// 所有窗口关闭时的逻辑（优化macOS行为）
app.on('window-all-closed', () => {
 // 只有在明确要退出时，或者在非 macOS 平台且你确实想让它随窗口关闭而退出时才调用
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit();
  }
  // 如果是 Windows 且 isQuitting 为 false，这里不执行 app.quit()，程序就会在后台运行
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