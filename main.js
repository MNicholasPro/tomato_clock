const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 400,
        height: 600,
        minWidth: 320,
        minHeight: 500,
        frame: false, // 去除默认窗口边框，使用自定义 UI
        webPreferences: {
            nodeIntegration: true, // 允许渲染进程访问 Node.js (简易模式下)
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
}

// 确保应用就绪后创建窗口
app.on('ready', () => {
    createWindow();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
