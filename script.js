// ============================================
// デバッグモード設定（コードでON/OFF）
// ============================================
const DEBUG_MODE = false; // true にするとデバッグモードが有効になります

// デバッグ用の時間（分単位、0-1439）
let debugTimeMinutes = 0;

// 画像要素の参照
const imageElements = {
    morning: document.getElementById('image-morning'),
    day: document.getElementById('image-day'),
    sunset: document.getElementById('image-sunset'),
    night: document.getElementById('image-night')
};

// 日の出・日没（分単位, 0-1439）
let sunriseMinutes = 5 * 60;   // フォールバック: 5:00
let sunsetMinutes = 18 * 60;   // フォールバック: 18:00
let sunTimesLoaded = false;

// 時間帯の定義（日本時間）
const timePeriods = {
    morning: { name: '朝（日の出前後1時間）' },
    day: { name: '昼（朝の時間帯と夕方の時間帯以外）' },
    sunset: { name: '夕方（日没前後1時間）' },
    night: { name: '夜（それ以外の時間）' }
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

// 日の出・日没をAPIから取得（東京駅あたりの座標）
async function fetchSunTimes() {
    try {
        const lat = 35.681236;
        const lng = 139.767125;
        const url = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&date=today&formatted=0`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.status !== 'OK') {
            console.warn('日の出・日没 API 取得に失敗したため、デフォルト値を使用します。');
            return;
        }

        const sunriseUtc = new Date(data.results.sunrise);
        const sunsetUtc = new Date(data.results.sunset);

        // JST に変換してから、分単位に
        const sunriseJst = new Date(sunriseUtc.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
        const sunsetJst = new Date(sunsetUtc.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

        sunriseMinutes = sunriseJst.getHours() * 60 + sunriseJst.getMinutes();
        sunsetMinutes = sunsetJst.getHours() * 60 + sunsetJst.getMinutes();
        sunTimesLoaded = true;
    } catch (e) {
        console.error('日の出・日没の取得に失敗しました:', e);
    }
}

// 現在表示すべきシーン（morning/day/sunset/night）を取得
function getCurrentSceneType(totalMinutes) {
    // 日の出・日没が未取得でも、一応フォールバック値で判定
    const sunriseStart = Math.max(0, sunriseMinutes - 60);
    const sunriseEnd = Math.min(1440, sunriseMinutes + 60);
    const sunsetStart = Math.max(0, sunsetMinutes - 60);
    const sunsetEnd = Math.min(1440, sunsetMinutes + 60);

    if (totalMinutes >= sunriseStart && totalMinutes < sunriseEnd) {
        return 'morning';
    }
    if (totalMinutes >= sunsetStart && totalMinutes < sunsetEnd) {
        return 'sunset';
    }
    if (totalMinutes >= sunriseEnd && totalMinutes < sunsetStart) {
        return 'day';
    }
    return 'night';
}

// 現在の時間帯名を取得
function getTimePeriodName(sceneType) {
    return timePeriods[sceneType]?.name ?? '';
}

// 画像と時間表示を更新する関数（切り替えはパキッと）
function updateScene() {
    const japanTime = getJapanTime();
    const hour = japanTime.getHours();
    const minute = japanTime.getMinutes();
    const totalMinutes = hour * 60 + minute;

    const sceneType = getCurrentSceneType(totalMinutes);

    // すべて一旦非表示にして、対象だけ不透明に（フェードなし）
    Object.entries(imageElements).forEach(([key, el]) => {
        if (!el) return;
        el.style.opacity = key === sceneType ? 1 : 0;
    });

    // 時間表示
    const currentTimeEl = document.getElementById('current-time');
    const timePeriodEl = document.getElementById('time-period');
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');

    if (currentTimeEl) currentTimeEl.textContent = `現在の日本時間: ${hh}:${mm}`;
    if (timePeriodEl) timePeriodEl.textContent = getTimePeriodName(sceneType);
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
            debugTimeMinutes = parseInt(e.target.value, 10);
            updateDebugTimeDisplay();
            updateScene();
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

// 初期化
function init() {
    // デバッグパネルの初期化
    initDebugPanel();

    // 初回の表示
    updateScene();

    // 日の出・日没を取得（取得後も自動更新に乗る）
    fetchSunTimes().then(() => {
        // 取得直後にもう一度更新
        updateScene();
    });

    // デバッグモードでない場合のみ、1秒ごとに時間を更新
    if (!DEBUG_MODE) {
        setInterval(updateScene, 1000);
    }
}

// ページ読み込み時に初期化
window.addEventListener('DOMContentLoaded', init);
