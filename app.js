// 黄金价格实时监控应用

// 页面元素
const priceDisplay = document.getElementById('price-display');
const priceChangeElement = document.getElementById('price-change');
const updateTimeElement = document.getElementById('update-time');
const statusMessage = document.getElementById('status-message');

// 配置
const REFRESH_INTERVAL = 10000; // 10秒刷新一次

// API URLs
const GOLD_API_URL = 'https://data-asg.goldprice.org/dbXRates/USD'; // 黄金价格API
// 备注: 其他备用API已被移除，因为它们不可用或需要API密钥
const USD_TO_RMB_API_URL = 'https://api.exchangerate-api.com/v4/latest/USD'; // 汇率API
const BACKUP_USD_TO_RMB_API_URL = 'https://open.er-api.com/v6/latest/USD'; // 备用汇率API

// 状态变量
let lastUsdToRmbRate = 7.2; // 默认汇率，以防API失败
let isFirstLoad = true;
let lastGoldPriceUsd = null; // 上次获取的黄金价格（美元/盎司）
let lastPriceChangePercent = null; // 上次获取的涨跌幅
let debugInfo = {}; // 用于存储调试信息
let lastSuccessfulData = null; // 存储最后一次成功获取的数据，用于API失败时显示

// 格式化价格显示
function formatPrice(price) {
    return price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 更新时间显示
function updateTimeDisplay() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('zh-CN', { hour12: false });
    const dateString = now.toLocaleDateString('zh-CN');
    updateTimeElement.textContent = `更新时间: ${dateString} ${timeString}`;
}

// 获取美元兑人民币汇率
async function getUsdToRmbRate() {
    try {
        statusMessage.textContent = '正在获取最新汇率...';
        
        // 尝试主要API
        try {
            const response = await fetch(USD_TO_RMB_API_URL, {
                mode: 'cors',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data && data.rates && data.rates.CNY) {
                    lastUsdToRmbRate = data.rates.CNY;
                    debugInfo.rateSource = 'primary';
                    debugInfo.rate = lastUsdToRmbRate;
                    return lastUsdToRmbRate;
                }
            }
            throw new Error('主要汇率API返回无效数据');
        } catch (primaryError) {
            console.warn('主要汇率API失败，尝试备用API', primaryError);
            
            // 尝试备用API
            const backupResponse = await fetch(BACKUP_USD_TO_RMB_API_URL);
            if (backupResponse.ok) {
                const backupData = await backupResponse.json();
                if (backupData && backupData.rates && backupData.rates.CNY) {
                    lastUsdToRmbRate = backupData.rates.CNY;
                    debugInfo.rateSource = 'backup';
                    debugInfo.rate = lastUsdToRmbRate;
                    return lastUsdToRmbRate;
                }
            }
            throw new Error('备用汇率API也失败了');
        }
    } catch (error) {
        console.error('获取汇率失败', error);
        statusMessage.textContent = '汇率API暂时不可用，使用默认汇率';
        debugInfo.rateSource = 'default';
        debugInfo.rate = lastUsdToRmbRate;
        return lastUsdToRmbRate; // 使用上次成功的汇率或默认值
    }
}

// 获取黄金价格数据
async function getGoldPrice() {
    try {
        statusMessage.textContent = '正在获取最新黄金价格...';
        
        const response = await fetch(GOLD_API_URL, {
            mode: 'cors',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API返回错误: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data || !data.items || !data.items[0] || typeof data.items[0].xauPrice !== 'number') {
            throw new Error('API返回的数据格式无效');
        }
        
        // 存储成功获取的数据
        lastSuccessfulData = data;
        
        return data;
    } catch (error) {
        console.error('获取黄金价格失败', error);
        statusMessage.textContent = '获取数据失败，显示缓存数据';
        
        // 如果有缓存数据，则使用缓存数据
        if (lastSuccessfulData) {
            return lastSuccessfulData;
        }
        
        throw error; // 如果没有缓存数据，则继续抛出错误
    }
}

// 更新页面显示
async function updateDisplay() {
    try {
        // 获取美元兑人民币汇率
        const usdToRmbRate = await getUsdToRmbRate();
        
        // 获取黄金价格数据
        const goldData = await getGoldPrice();
        
        // 提取黄金价格（美元/盎司）
        const goldPriceUsd = goldData.items[0].xauPrice;
        
        // 计算人民币每克价格
        // 1盎司 = 31.1035克
        const goldPriceRmbPerGram = (goldPriceUsd * usdToRmbRate) / 31.1035;
        
        // 计算价格变化百分比
        let priceChangePercent = 0;
        if (lastGoldPriceUsd !== null) {
            priceChangePercent = ((goldPriceUsd - lastGoldPriceUsd) / lastGoldPriceUsd) * 100;
        } else if (goldData.items[0].chgXau) {
            // 如果API提供了变化百分比，则使用API提供的数据
            priceChangePercent = goldData.items[0].chgXau;
        }
        
        // 更新上次价格记录
        lastGoldPriceUsd = goldPriceUsd;
        lastPriceChangePercent = priceChangePercent;
        
        // 更新价格显示
        priceDisplay.textContent = `¥${formatPrice(goldPriceRmbPerGram)}/克`;
        
        // 更新价格变化显示
        const changePrefix = priceChangePercent >= 0 ? '+' : '';
        const changeClass = priceChangePercent >= 0 ? 'positive' : 'negative';
        priceChangeElement.textContent = `${changePrefix}${priceChangePercent.toFixed(2)}%`;
        priceChangeElement.className = `price-change ${changeClass}`;
        
        // 更新时间显示
        updateTimeDisplay();
        
        // 更新状态消息
        statusMessage.textContent = '数据已更新';
        
        // 第一次加载完成
        isFirstLoad = false;
        
    } catch (error) {
        console.error('更新显示失败', error);
        
        if (isFirstLoad) {
            // 如果是第一次加载就失败，显示错误消息
            priceDisplay.textContent = '数据加载失败';
            statusMessage.textContent = '无法连接到服务器，请稍后再试';
        } else {
            // 如果之前有成功加载过，则保持上次的数据，只更新状态消息
            statusMessage.textContent = '更新失败，显示的是上次成功获取的数据';
            // 仍然更新时间，表明我们尝试了更新
            updateTimeDisplay();
        }
    }
}

// 页面加载完成后立即更新一次
document.addEventListener('DOMContentLoaded', () => {
    updateDisplay();
    
    // 设置定时更新
    setInterval(updateDisplay, REFRESH_INTERVAL);
});

// 添加CSS样式
const styleElement = document.createElement('style');
styleElement.textContent = `
    .positive {
        color: #4caf50;
    }
    .negative {
        color: #f44336;
    }
`;
document.head.appendChild(styleElement);