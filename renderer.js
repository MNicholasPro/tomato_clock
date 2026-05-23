// const { ipcRenderer } = require('electron'); // 注意：需要在 preload.js 中暴露或在 main.js 中配置 nodeIntegration
const timeDisplay = document.getElementById('time-display');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const resetBtn = document.getElementById('reset-btn');
const customTimeInput = document.getElementById('custom-time');
const setCustomTimeBtn = document.getElementById('set-time-btn');
const tickToggleBtn = document.getElementById('tick-toggle');
const switchModeBtn = document.getElementById('switch-mode-btn');
const headerTitle = document.getElementById('header-title');
const statusDot = document.getElementById('status-dot');
const progressBar = document.getElementById('progress-bar');
const body = document.body;

let timer = null;
// 从本地存储读取保存的时间，如果没有则默认 25*60
// --- 修改点 1: 从 localStorage 读取保存的时间 ---
const savedTime = localStorage.getItem('customTotalSeconds');
let totalSeconds = savedTime ? parseInt(savedTime) : 25 * 60;
let remainingSeconds = totalSeconds;

let isPaused = false;
let isWorking = true; // true = 专注, false = 休息
let soundEnabled = true;

// 页面加载时请求通知权限（仅渲染进程支持）
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission().catch(err => {
    console.warn('权限请求出错:', err);
  });
}

// 进度条动画
function updateProgress() {
    const progress = (totalSeconds - remainingSeconds) / totalSeconds;
    progressBar.style.width = `${progress * 100}%`;
}

// 格式化时间
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 更新显示
function updateDisplay() {
    timeDisplay.textContent = formatTime(remainingSeconds);
    document.title = `${formatTime(remainingSeconds)} - 番茄时钟`;
    updateProgress();
}

// 音效
function playTick() {
    if (!soundEnabled) return;
    // 使用简单的振荡器生成滴答声
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.frequency.value = 800;
    gainNode.gain.value = 0.1;
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.05);
}

// 完成提示
function playCompletion() {
    if (!soundEnabled) return;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.frequency.value = 523.25; // C5
    gainNode.gain.value = 0.2;
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.2);
    
    setTimeout(() => {
        oscillator.frequency.value = 659.25; // E5
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.2);
    }, 200);
    
    setTimeout(() => {
        oscillator.frequency.value = 783.99; // G5
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.4);
    }, 400);
}

// 切换模式
function switchMode() {
    // 新增：恢复图标
    if (window.electronAPI) window.electronAPI.setTrayAlert(false);
    clearInterval(timer);
    isWorking = !isWorking;
    
    if (isWorking) {
        totalSeconds = 25 * 60;
        headerTitle.textContent = '专注时间';
        switchModeBtn.textContent = '休息一下';
        body.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        statusDot.style.backgroundColor = '#ff6b6b';
        statusDot.style.boxShadow = '0 0 10px #ff6b6b';
    } else {
        totalSeconds = 5 * 60;
        headerTitle.textContent = '休息时间';
        switchModeBtn.textContent = '回到专注';
        body.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
        statusDot.style.backgroundColor = '#38ef7d';
        statusDot.style.boxShadow = '0 0 10px #38ef7d';
    }
    
    remainingSeconds = totalSeconds;
    isPaused = false;
    startBtn.style.display = 'block';
    pauseBtn.style.display = 'none';
    progressBar.style.width = '0%';
    updateDisplay();
}

// 开始计时
function startTimer() {
    if (window.electronAPI) window.electronAPI.setTrayAlert(false);
    if (!isPaused) {
        remainingSeconds = totalSeconds;
    }

    timer = setInterval(() => {
        remainingSeconds--;
        updateDisplay();

        if (remainingSeconds > 0) {
            playTick();
        }

        if (remainingSeconds <= 0) {
            clearInterval(timer);
            console.log('⏰ 计时完成！window.electronAPI:', window.electronAPI ? '存在' : '不存在');

            if (window.electronAPI) {
                window.electronAPI.setTrayAlert(true);
                console.log('✅ 设置红点图标成功');

                const title = isWorking ? '🍅 专注结束' : '☕ 休息结束';
                const message = isWorking ? '专注时间结束！休息一下吧。' : '休息结束！回到专注状态。';

                console.log('📢 发送通知:', { title, message });
                // 触发通知
                window.electronAPI.triggerCompletionNotification({
                    title: title,
                    message: message
                });
                console.log('✅ IPC 通知已发送');
            } else {
                console.error('❌ window.electronAPI 未定义');
            }

            playCompletion();
            remainingSeconds = 0;
            updateDisplay();
        }
    }, 1000);

    // 【修复】将 'arg' 改为 'none'，否则按钮不会消失
    startBtn.style.display = 'none';
    pauseBtn.style.display = 'block';
    isPaused = false;
}

// 暂停计时
function pauseTimer() {
    clearInterval(timer);
    startBtn.style.display = 'block';
    pauseBtn.style.display = 'none';
    isPaused = true;
}

// 重置计时
function resetTimer() {
    // 新增：恢复图标
    if (window.electronAPI) window.electronAPI.setTrayAlert(false);
    clearInterval(timer);
    remainingSeconds = totalSeconds;
    isPaused = false;
    startBtn.style.display = 'block';
    pauseBtn.style.display = 'none';
    progressBar.style.width = '0%';
    updateDisplay();
}

// 事件监听
startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', pauseTimer);
resetBtn.addEventListener('click', resetTimer);
switchModeBtn.addEventListener('click', switchMode);

// 修改设定时间的逻辑，增加保存功能
setCustomTimeBtn.addEventListener('click', () => {
    // 新增：恢复图标
    if (window.electronAPI) window.electronAPI.setTrayAlert(false);
    const minutes = parseInt(customTimeInput.value);
    if (minutes > 0 && minutes <= 60) {
        totalSeconds = minutes * 60;
        // --- 修改点 3: 保存设定时间到本地存储 ---
        localStorage.setItem('customTotalSeconds', totalSeconds);
        
        remainingSeconds = totalSeconds;
        updateDisplay();
        progressBar.style.width = '0%';
    }
});

// 切换音效
tickToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    tickToggleBtn.textContent = soundEnabled ? '音效: 开' : '音效: 关';
});

// 初始化
updateDisplay();

