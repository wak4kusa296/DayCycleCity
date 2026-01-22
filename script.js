// ============================================
// デバッグモード設定（コードでON/OFF）
// ============================================
const DEBUG_MODE = false; // trueにするとデバッグモードが有効になります

// デバッグ用の時間（分単位、0-1439）
let debugTimeMinutes = 0;

// 動画要素の参照
const videoElements = {
    morning: document.getElementById('video-morning'),
    day: document.getElementById('video-day'),
    sunset: document.getElementById('video-sunset'),
    night: document.getElementById('video-night')
};

// 動画同期用の変数
let masterVideo = null; // 基準となる動画
let syncInterval = null; // 同期チェック用のインターバル
let loadedVideos = new Set(); // 読み込み済みの動画を追跡

// 時間帯の定義（日本時間）
const timePeriods = {
    morning: { start: 5, end: 7, name: '日の出' },
    day: { start: 7, end: 17, name: '日中' },
    sunset: { start: 17, end: 19, name: '日没' },
    night: { start: 19, end: 5, name: '夜' }
};

// 日本時間を取得する関数
function getJapanTime() {
    if (DEBUG_MODE) {
        // デバッグモード: スライダーで制御された時間を使用
        const hours = Math.floor(debugTimeMinutes / 60);
        const minutes = debugTimeMinutes % 60;
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        return date;
    } else {
        // 通常モード: リアルタイムの日本時間
        const now = new Date();
        const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
        return japanTime;
    }
}

// 各動画層の透明度を計算する関数
function calculateOpacity(hour, minute) {
    const opacities = {
        morning: 0,
        day: 0,
        sunset: 0,
        night: 0
    };
    
    const totalMinutes = hour * 60 + minute;
    const transitionDuration = 120; // 遷移時間（分）- 2時間に延長
    
    // 各時間帯の境界を定義（分単位）
    // 遷移期間を長くするため、境界時間を調整
    const morningStart = 3 * 60;      // 3:00 - 5:00: night → morning の遷移（2時間）
    const morningEnd = 5 * 60;        // 5:00 - 7:00: morning → day の遷移（2時間）
    const dayStart = 7 * 60;          // 7:00 - 15:00: day のみ
    const dayEnd = 15 * 60;           // 15:00 - 17:00: day → sunset の遷移（2時間）
    const sunsetStart = 17 * 60;      // 17:00 - 19:00: sunset → night の遷移（2時間）
    const sunsetEnd = 19 * 60;        // 19:00 - 3:00: night のみ
    
    // 日をまたぐ場合（19:00-3:00）
    if (totalMinutes >= sunsetEnd || totalMinutes < morningStart) {
        if (totalMinutes >= sunsetEnd) {
            // 19:00-23:59: night のみ
            opacities.night = 1;
        } else {
            // 0:00-3:00: night のみ
            opacities.night = 1;
        }
    } else if (totalMinutes >= morningStart && totalMinutes < morningEnd) {
        // 3:00-5:00: night → morning の遷移（2時間）
        const transitionProgress = (totalMinutes - morningStart) / transitionDuration;
        opacities.night = 1 - transitionProgress;
        opacities.morning = transitionProgress;
    } else if (totalMinutes >= morningEnd && totalMinutes < dayStart) {
        // 5:00-7:00: morning → day の遷移（2時間）
        const transitionProgress = (totalMinutes - morningEnd) / transitionDuration;
        opacities.morning = 1 - transitionProgress;
        opacities.day = transitionProgress;
    } else if (totalMinutes >= dayStart && totalMinutes < dayEnd) {
        // 7:00-15:00: day のみ
        opacities.day = 1;
    } else if (totalMinutes >= dayEnd && totalMinutes < sunsetStart) {
        // 15:00-17:00: day → sunset の遷移（2時間）
        const transitionProgress = (totalMinutes - dayEnd) / transitionDuration;
        opacities.day = 1 - transitionProgress;
        opacities.sunset = transitionProgress;
    } else if (totalMinutes >= sunsetStart && totalMinutes < sunsetEnd) {
        // 17:00-19:00: sunset → night の遷移（2時間）
        const transitionProgress = (totalMinutes - sunsetStart) / transitionDuration;
        opacities.sunset = 1 - transitionProgress;
        opacities.night = transitionProgress;
    }
    
    return opacities;
}

// 現在の時間帯に必要な動画を判定する関数
function getRequiredVideos(hour, minute) {
    const totalMinutes = hour * 60 + minute;
    const transitionDuration = 120; // 遷移時間（分）
    const morningStart = 3 * 60;
    const morningEnd = 5 * 60;
    const dayStart = 7 * 60;
    const dayEnd = 15 * 60;
    const sunsetStart = 17 * 60;
    const sunsetEnd = 19 * 60;
    
    const required = new Set();
    
    // 日をまたぐ場合（19:00-3:00）
    if (totalMinutes >= sunsetEnd || totalMinutes < morningStart) {
        required.add('night');
        // 3:00に近づいたら morning も事前読み込み（30分前）
        if (totalMinutes >= 23 * 60 + 30 || totalMinutes < morningStart - 30) {
            required.add('morning');
        }
    } else if (totalMinutes >= morningStart && totalMinutes < morningEnd) {
        // 3:00-5:00: night → morning の遷移
        required.add('night');
        required.add('morning');
    } else if (totalMinutes >= morningEnd && totalMinutes < dayStart) {
        // 5:00-7:00: morning → day の遷移
        required.add('morning');
        required.add('day');
    } else if (totalMinutes >= dayStart && totalMinutes < dayEnd) {
        // 7:00-15:00: day のみ
        required.add('day');
        // 15:00に近づいたら sunset も事前読み込み（30分前）
        if (totalMinutes >= dayEnd - 30) {
            required.add('sunset');
        }
    } else if (totalMinutes >= dayEnd && totalMinutes < sunsetStart) {
        // 15:00-17:00: day → sunset の遷移
        required.add('day');
        required.add('sunset');
    } else if (totalMinutes >= sunsetStart && totalMinutes < sunsetEnd) {
        // 17:00-19:00: sunset → night の遷移
        required.add('sunset');
        required.add('night');
    }
    
    return required;
}

// 動画を読み込む関数
async function loadVideo(videoName) {
    const video = videoElements[videoName];
    if (!video || loadedVideos.has(videoName)) {
        return;
    }
    
    try {
        video.load();
        await new Promise((resolve, reject) => {
            video.addEventListener('loadeddata', resolve, { once: true });
            video.addEventListener('error', reject, { once: true });
        });
        
        loadedVideos.add(videoName);
        
        // 最初の動画を基準動画に設定
        if (!masterVideo) {
            masterVideo = video;
        }
        
        // 再生開始
        await video.play();
        
        // 基準動画に同期
        if (masterVideo && video !== masterVideo) {
            video.currentTime = masterVideo.currentTime;
        }
    } catch (e) {
        console.error(`動画 ${videoName} の読み込みに失敗しました:`, e);
    }
}

// 不要な動画を停止する関数
function unloadVideo(videoName) {
    const video = videoElements[videoName];
    if (!video || !loadedVideos.has(videoName)) {
        return;
    }
    
    video.pause();
    video.currentTime = 0;
    video.load(); // preload="none" に戻す
    loadedVideos.delete(videoName);
    
    // 基準動画が削除された場合、別の動画を基準に設定
    if (masterVideo === video) {
        const remaining = Object.values(videoElements).find(v => loadedVideos.has(getVideoName(v)));
        masterVideo = remaining || null;
    }
}

// 動画要素から名前を取得
function getVideoName(video) {
    for (const [name, element] of Object.entries(videoElements)) {
        if (element === video) return name;
    }
    return null;
}

// 動画層の透明度を更新する関数
function updateVideoOpacity() {
    const japanTime = getJapanTime();
    const hour = japanTime.getHours();
    const minute = japanTime.getMinutes();
    
    const opacities = calculateOpacity(hour, minute);
    const requiredVideos = getRequiredVideos(hour, minute);
    
    // 必要な動画を読み込む
    requiredVideos.forEach(videoName => {
        if (!loadedVideos.has(videoName)) {
            loadVideo(videoName);
        }
    });
    
    // 不要な動画を停止（透明度が0で、次の時間帯でも不要な場合）
    Object.keys(videoElements).forEach(videoName => {
        if (!requiredVideos.has(videoName) && loadedVideos.has(videoName)) {
            // 少し待ってから削除（遷移中の誤削除を防ぐ）
            setTimeout(() => {
                const currentRequired = getRequiredVideos(
                    getJapanTime().getHours(),
                    getJapanTime().getMinutes()
                );
                if (!currentRequired.has(videoName)) {
                    unloadVideo(videoName);
                }
            }, 5000); // 5秒後に確認
        }
    });
    
    // 各動画層の透明度を設定
    videoElements.morning.style.opacity = opacities.morning;
    videoElements.day.style.opacity = opacities.day;
    videoElements.sunset.style.opacity = opacities.sunset;
    videoElements.night.style.opacity = opacities.night;
}

// 時間表示を更新する関数
function updateTimeDisplay() {
    // 動画層の透明度を更新
    updateVideoOpacity();
}

// デバッグパネルの初期化
function initDebugPanel() {
    if (!DEBUG_MODE) return;
    
    const debugPanel = document.getElementById('debug-panel');
    if (debugPanel) {
        debugPanel.style.display = 'block';
    }
    
    const timeSlider = document.getElementById('debug-time-slider');
    const timeDisplay = document.getElementById('debug-time-display');
    
    if (timeSlider && timeDisplay) {
        // 現在の日本時間で初期化
        const japanTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
        debugTimeMinutes = japanTime.getHours() * 60 + japanTime.getMinutes();
        timeSlider.value = debugTimeMinutes;
        updateDebugTimeDisplay();
        
        // スライダーの変更イベント
        timeSlider.addEventListener('input', (e) => {
            debugTimeMinutes = parseInt(e.target.value);
            updateDebugTimeDisplay();
            updateTimeDisplay();
        });
    }
}

// デバッグ時間表示を更新
function updateDebugTimeDisplay() {
    if (!DEBUG_MODE) return;
    
    const timeDisplay = document.getElementById('debug-time-display');
    if (timeDisplay) {
        const hours = Math.floor(debugTimeMinutes / 60);
        const minutes = debugTimeMinutes % 60;
        timeDisplay.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
}

// 動画の再生位置を同期する関数
function syncVideos() {
    if (!masterVideo || masterVideo.readyState < 2) return;
    
    const masterTime = masterVideo.currentTime;
    
    // 読み込み済みの動画のみを同期
    loadedVideos.forEach(videoName => {
        const video = videoElements[videoName];
        if (video && video !== masterVideo && video.readyState >= 2) {
            const timeDiff = Math.abs(video.currentTime - masterTime);
            // 0.1秒以上の差がある場合のみ同期（微細な調整を避ける）
            if (timeDiff > 0.1) {
                video.currentTime = masterTime;
            }
        }
    });
}

// 動画の同期を開始（読み込み済みの動画がある場合のみ）
function startVideoSync() {
    if (loadedVideos.size === 0) return;
    
    // 基準動画を設定（最初の読み込み済み動画）
    if (!masterVideo) {
        for (const videoName of loadedVideos) {
            const video = videoElements[videoName];
            if (video && video.readyState >= 2) {
                masterVideo = video;
                break;
            }
        }
    }
    
    if (!masterVideo) return;
    
    // すべての読み込み済み動画を基準動画と同じ位置から開始
    const startTime = masterVideo.currentTime;
    loadedVideos.forEach(videoName => {
        const video = videoElements[videoName];
        if (video && video.readyState >= 2 && video !== masterVideo) {
            video.currentTime = startTime;
        }
    });
    
    // 定期的に同期チェック（100msごと）
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    syncInterval = setInterval(syncVideos, 100);
}

// 動画の同期を開始（読み込み済みの動画がある場合のみ）
function startVideoSync() {
    if (loadedVideos.size === 0) return;
    
    // 基準動画を設定（最初の読み込み済み動画）
    if (!masterVideo) {
        for (const videoName of loadedVideos) {
            const video = videoElements[videoName];
            if (video && video.readyState >= 2) {
                masterVideo = video;
                break;
            }
        }
    }
    
    if (!masterVideo) return;
    
    // すべての読み込み済み動画を基準動画と同じ位置から開始
    const startTime = masterVideo.currentTime;
    loadedVideos.forEach(videoName => {
        const video = videoElements[videoName];
        if (video && video.readyState >= 2 && video !== masterVideo) {
            video.currentTime = startTime;
        }
    });
    
    // 定期的に同期チェック（100msごと）
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    syncInterval = setInterval(syncVideos, 100);
}

// 初期化
function init() {
    // 全ての動画にイベントリスナーを設定
    Object.values(videoElements).forEach(video => {
        // ループ時の同期
        video.addEventListener('timeupdate', () => {
            // 動画が終了に近づいたら（ループ前）、同期を確認
            if (video.duration && video.currentTime >= video.duration - 0.5) {
                if (video === masterVideo) {
                    // 基準動画がループする前に、他の動画も同期
                    syncVideos();
                }
            }
        });
        
        // シーク時の同期
        video.addEventListener('seeked', () => {
            if (video === masterVideo) {
                // 基準動画がシークされたら、他の動画も同期
                syncVideos();
            }
        });
    });
    
    // デバッグパネルの初期化
    initDebugPanel();
    
    // 初回の時間表示と動画設定（必要な動画を読み込む）
    updateTimeDisplay();
    
    // デバッグモードでない場合のみ、1秒ごとに時間を更新
    if (!DEBUG_MODE) {
        setInterval(updateTimeDisplay, 1000);
    }
    
    // 動画の同期を開始（読み込み済みの動画がある場合）
    setTimeout(() => {
        if (loadedVideos.size > 0) {
            startVideoSync();
        }
    }, 1000);
}

// ページ読み込み時に初期化
window.addEventListener('DOMContentLoaded', init);
