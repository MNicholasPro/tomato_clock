const { contextBridge, ipcRenderer } = require('electron');

console.log('🔧 Preload.js 已加载');

contextBridge.exposeInMainWorld('electronAPI', {
    setTrayAlert: (isAlert) => {
        console.log('📤 发送 set-tray-alert:', isAlert);
        ipcRenderer.send('set-tray-alert', isAlert);
    },
    // 【修复】将名称改为与 main.js 匹配的 'trigger-completion-notification'
    triggerCompletionNotification: (data) => {
        console.log('📤 发送 trigger-completion-notification:', data);
        ipcRenderer.send('trigger-completion-notification', data);
    }
});

console.log('✅ electronAPI 已暴露到 window');