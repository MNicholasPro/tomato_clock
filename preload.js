const { contextBridge, ipcRenderer } = require('electron');

// 将 IPC 通信安全地暴露给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    setTrayAlert: (isAlert) => ipcRenderer.send('set-tray-alert', isAlert)
});