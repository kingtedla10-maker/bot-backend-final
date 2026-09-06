const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

// 🔴 Your Active Bot Token
const token = '5813025685:AAGcePDBDdny0I5yMnPfNq1jd3EF8uRG7tg';

// Your Cloudflare Worker Mini App URL
const webAppUrl = 'https://safaricom-bonus-app.king-tedla-10.workers.dev/';

// 👑 Admin Telegram ID
const ADMIN_ID = '988618748';

// Memory Database
const users = {};
const adminStates = {}; 

// ==========================================
// 🌐 API BRIDGE & RENDER WEB SERVICE
// ==========================================
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.url.startsWith('/api/user')) {
        const baseURL = `http://${req.headers.host || 'localhost'}`;
        const parsedUrl = new URL(req.url, baseURL);
        const userId = parsedUrl.searchParams.get('id');
        
        const userData = users[userId] || { balance: 0, invitedCount: 0 };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(userData));
        return;
    }

    res.writeHead(200);
    res.end('Safaricom Bonus Bot API is Live.');
});
server.listen(process.env.PORT || 3000);

// Initialize the bot
const bot = new TelegramBot(token, { polling: true });

bot.setChatMenuButton({
    menu_button: { type: 'web_app', text: '🌟 Open', web_app: { url: webAppUrl } }
});

// ==========================================
// 🚀 REFERRAL TRACKING SYSTEM
// ==========================================
bot.onText(/\/start(?: (.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const referralParam = match[1]; 
    let refId = null;
    
    if (referralParam && referralParam.startsWith('share_ref_')) {
        refId = referralParam.split('share_ref_')[1];
    }

    // Register new user and award inviter
    if (!users[chatId]) {
        users[chatId] = { balance: 0, invitedCount: 0, referrer: null };

        if (refId && refId != chatId) {
            users[chatId].referrer = refId;
            
            if (!users[refId]) {
                users[refId] = { balance: 0, invitedCount: 0, referrer: null };
            }
            
            // Add exactly 50 ETB to inviter
            users[refId].balance += 50;
            users[refId].invitedCount += 1;
            console.log(`User ${refId} earned 50 ETB! New Balance: ${users[refId].balance}`);
        }
    }

    const welcomeText = `Welcome to Safaricom Bonus!🎉\n\nይጋብዙ ዛሬውኑ ጀምሮ ገንዘብ መስራት ይጀምሩ አንድ ሰው ሲጋብዙ 50 ብር ይሰራሉ የራስዎን መጋበዣ ሊንክ OPEN ብለው በመክፈት ማግኘት ይችላሉ።`;
    const photoUrl = 'https://i.ibb.co/JWGTtB2H/photo-2026-09-05-21-45-53.jpg';

    const options = {
        caption: welcomeText,
        reply_markup: { inline_keyboard: [[{ text: '🌟 Open', web_app: { url: webAppUrl } }]] }
    };

    bot.sendPhoto(chatId, photoUrl, options).catch(err => {
        bot.sendMessage(chatId, welcomeText, { reply_markup: options.reply_markup });
    });
});

// ==========================================
// 📢 ADMIN BROADCAST SYSTEM
// ==========================================
bot.onText(/\/broadcast/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== ADMIN_ID) return;
    adminStates[chatId] = 'WAITING_FOR_MESSAGE';
    bot.sendMessage(chatId, `📢 <b>Broadcast Mode Activated!</b>\n\nPlease send me the exact message/photo to send everyone.\nTo cancel, type /cancel`, { parse_mode: 'HTML' });
});

bot.onText(/\/cancel/, (msg) => {
    const chatId = msg.chat.id;
    if (adminStates[chatId] === 'WAITING_FOR_MESSAGE') {
        adminStates[chatId] = 'IDLE';
        bot.sendMessage(chatId, "🛑 <b>Broadcast Cancelled.</b>", { parse_mode: 'HTML' });
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (msg.text && msg.text.startsWith('/')) return;

    if (chatId.toString() === ADMIN_ID && adminStates[chatId] === 'WAITING_FOR_MESSAGE') {
        adminStates[chatId] = 'IDLE';
        const userIds = Object.keys(users);
        bot.sendMessage(chatId, `⏳ <b>Broadcasting to ${userIds.length} users...</b>`, { parse_mode: 'HTML' });
        let successCount = 0;
        for (const uid of userIds) {
            try {
                await bot.copyMessage(uid, chatId, msg.message_id);
                successCount++;
            } catch (error) { }
        }
        return bot.sendMessage(chatId, `✅ <b>Broadcast Complete!</b>\nDelivered to ${successCount} users.`, { parse_mode: 'HTML' });
    }

    const autoReplyText = `Use button to open Safaricom Bonus.\n\nእባክዎ ለመክፈት ከታች OPEN የሚለውን ይጫኑ 👇`;
    bot.sendMessage(chatId, autoReplyText, {
        reply_markup: { inline_keyboard: [[{ text: '🌟 Open', web_app: { url: webAppUrl } }]] }
    });
});

console.log('🚀 Safaricom Bonus Bot is Live!');
