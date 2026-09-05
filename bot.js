const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

// 🔴 Your Bot Token
const token = '5813025685:AAEMJm5L8mXHdJZBIX5reALHrjNzq8AkMxM';

// Your Cloudflare Worker Mini App URL
const webAppUrl = 'https://safaricom-bonus-app.king-tedla-10.workers.dev/';

// 👑 Admin Telegram ID
const ADMIN_ID = '988618748';

// --- RENDER WEB SERVICE FIX ---
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Safaricom Bonus Bot is Live and Running!');
});
server.listen(process.env.PORT || 3000);

// Initialize the bot
const bot = new TelegramBot(token, { polling: true });

// Simple memory database
const users = {};
const adminStates = {}; 

bot.setChatMenuButton({
    menu_button: { type: 'web_app', text: 'OPEN', web_app: { url: webAppUrl } }
});

// Handle /start command and Referral System
bot.onText(/\/start(?: (.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    
    const referralParam = match[1]; 
    let refId = null;
    
    if (referralParam && referralParam.startsWith('share_ref_')) {
        refId = referralParam.split('share_ref_')[1];
    }

    // Register new user
    if (!users[chatId]) {
        users[chatId] = { balance: 0, invitedCount: 0, referrer: null };

        // --- BULLETPROOF REFERRAL LOGIC ---
        if (refId && refId != chatId) {
            users[chatId].referrer = refId;
            
            // FIX: If Render wiped the memory, recreate the inviter's profile!
            if (!users[refId]) {
                users[refId] = { balance: 0, invitedCount: 0, referrer: null };
            }
            
            // Successfully add 50 ETB and 1 Invite
            users[refId].balance += 50;
            users[refId].invitedCount += 1;
        }
    }

    const welcomeText = `Welcome to Safaricom Bonus!🎉\n\nይጋብዙ ዛሬውኑ ጀምሮ ገንዘብ መስራት ይጀምሩ አንድ ሰው ሲጋብዙ 50 ብር ይሰራሉ የራስዎን መጋበዣ ሊንክ OPEN ብለው በመክፈት ማግኘት ይችላሉ።`;
    const photoUrl = 'https://i.ibb.co/JWGTtB2H/photo-2026-09-05-21-45-53.jpg';

    const options = {
        caption: welcomeText,
        reply_markup: {
            inline_keyboard: [[{ text: 'OPEN', web_app: { url: webAppUrl } }]]
        }
    };

    bot.sendPhoto(chatId, photoUrl, options).catch(err => {
        bot.sendMessage(chatId, welcomeText, { reply_markup: options.reply_markup });
    });
});

// ==========================================
// 📢 EXCLUSIVE ADMIN BROADCAST SYSTEM
// ==========================================
bot.onText(/\/broadcast/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== ADMIN_ID) {
        return bot.sendMessage(chatId, "⚠️ <b>Access Denied</b>", { parse_mode: 'HTML' });
    }
    adminStates[chatId] = 'WAITING_FOR_MESSAGE';
    bot.sendMessage(chatId, `📢 <b>Broadcast Mode Activated!</b>\n\nPlease send me the message/photo you want to broadcast.\nTo cancel, type /cancel`, { parse_mode: 'HTML' });
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

    // Admin Broadcasting
    if (chatId.toString() === ADMIN_ID && adminStates[chatId] === 'WAITING_FOR_MESSAGE') {
        adminStates[chatId] = 'IDLE';
        const userIds = Object.keys(users);
        if (userIds.length === 0) return bot.sendMessage(chatId, "⚠️ No users found.");

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

    // Auto-Reply for non-commands
    const autoReplyText = `Use button to open Safaricom Bonus.\n\nእባክዎ ለመክፈት ከታች OPEN የሚለውን ይጫኑ 👇`;
    bot.sendMessage(chatId, autoReplyText, {
        reply_markup: { inline_keyboard: [[{ text: '🌟 Open', web_app: { url: webAppUrl } }]] }
    });
});

console.log('🚀 Safaricom Bonus Bot is beautifully running...');
