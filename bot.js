const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const mongoose = require('mongoose');

// 🔴 Your Active Bot Token
const token = '5813025685:AAGcePDBDdny0I5yMnPfNq1jd3EF8uRG7tg';
const webAppUrl = 'https://safaricom-bonus-app.king-tedla-10.workers.dev/';
const ADMIN_ID = '988618748';

// 🔴 YOUR MONGODB CONNECTION STRING
const mongoURI = 'mongodb+srv://learningtvhappy_db_user:Xm2sMSbkNLt8XLiA@cluster0.jnii5p7.mongodb.net/safaricom_bonus?retryWrites=true&w=majority&appName=Cluster0';

// Connect to MongoDB Atlas
mongoose.connect(mongoURI).then(() => {
    console.log('✅ Connected to MongoDB!');
}).catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
});

// Database Schema (Replaces the temporary memory)
const userSchema = new mongoose.Schema({
    chatId: { type: String, unique: true },
    balance: { type: Number, default: 0 },
    invitedCount: { type: Number, default: 0 },
    referrer: { type: String, default: null }
});
const User = mongoose.model('User', userSchema);

const adminStates = {}; 

// ==========================================
// 🌐 API BRIDGE & RENDER WEB SERVICE
// ==========================================
const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.url.startsWith('/api/user')) {
        const baseURL = `http://${req.headers.host || 'localhost'}`;
        const parsedUrl = new URL(req.url, baseURL);
        const userId = parsedUrl.searchParams.get('id');
        
        let userData = await User.findOne({ chatId: userId });
        if (!userData) {
            userData = { balance: 0, invitedCount: 0 };
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ balance: userData.balance, invitedCount: userData.invitedCount }));
        return;
    }

    res.writeHead(200);
    res.end('Safaricom Bonus Bot API is Live.');
});
server.listen(process.env.PORT || 3000);

const bot = new TelegramBot(token, { polling: true });

bot.setChatMenuButton({
    menu_button: { type: 'web_app', text: 'OPEN', web_app: { url: webAppUrl } }
});

// ==========================================
// 🚀 PERMANENT REFERRAL TRACKING SYSTEM
// ==========================================
bot.onText(/\/start(?: (.*))?/, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    const referralParam = match[1]; 
    let refId = null;
    
    if (referralParam && referralParam.startsWith('share_ref_')) {
        refId = referralParam.split('share_ref_')[1];
    }

    let user = await User.findOne({ chatId });

    if (!user) {
        user = new User({ chatId, balance: 0, invitedCount: 0, referrer: null });

        if (refId && refId !== chatId) {
            user.referrer = refId;
            let referrerUser = await User.findOne({ chatId: refId });
            
            if (!referrerUser) {
                 referrerUser = new User({ chatId: refId, balance: 50, invitedCount: 1 });
            } else {
                 referrerUser.balance += 50;
                 referrerUser.invitedCount += 1;
            }
            await referrerUser.save(); 
            console.log(`User ${refId} earned 50 ETB!`);
        }
        await user.save(); 
    }

    const welcomeText = `Welcome to Safaricom Bonus!🎉\n\nይጋብዙ ዛሬውኑ ጀምሮ ገንዘብ መስራት ይጀምሩ አንድ ሰው ሲጋብዙ 50 ብር ይሰራሉ የራስዎን መጋበዣ ሊንክ OPEN ብለው በመክፈት ማግኘት ይችላሉ።`;
    const photoUrl = 'https://i.ibb.co/JWGTtB2H/photo-2026-09-05-21-45-53.jpg';

    const options = {
        caption: welcomeText,
        reply_markup: { inline_keyboard: [[{ text: 'OPEN', web_app: { url: webAppUrl } }]] }
    };

    bot.sendPhoto(chatId, photoUrl, options).catch(err => {
        bot.sendMessage(chatId, welcomeText, { reply_markup: options.reply_markup });
    });
});

// ==========================================
// 📢 ADMIN BROADCAST SYSTEM
// ==========================================
bot.onText(/\/broadcast/, (msg) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== ADMIN_ID) return;
    adminStates[chatId] = 'WAITING_FOR_MESSAGE';
    bot.sendMessage(chatId, `📢 <b>Broadcast Mode Activated!</b>\n\nPlease send me the exact message/photo to send everyone.\nTo cancel, type /cancel`, { parse_mode: 'HTML' });
});

bot.onText(/\/cancel/, (msg) => {
    const chatId = msg.chat.id.toString();
    if (adminStates[chatId] === 'WAITING_FOR_MESSAGE') {
        adminStates[chatId] = 'IDLE';
        bot.sendMessage(chatId, "🛑 <b>Broadcast Cancelled.</b>", { parse_mode: 'HTML' });
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    if (msg.text && msg.text.startsWith('/')) return;

    if (chatId === ADMIN_ID && adminStates[chatId] === 'WAITING_FOR_MESSAGE') {
        adminStates[chatId] = 'IDLE';
        
        const allUsers = await User.find({}, 'chatId');
        bot.sendMessage(chatId, `⏳ <b>Broadcasting to ${allUsers.length} users...</b>`, { parse_mode: 'HTML' });
        
        let successCount = 0;
        for (const u of allUsers) {
            try {
                await bot.copyMessage(u.chatId, chatId, msg.message_id);
                successCount++;
            } catch (error) { }
        }
        return bot.sendMessage(chatId, `✅ <b>Broadcast Complete!</b>\nDelivered to ${successCount} users.`, { parse_mode: 'HTML' });
    }

    const autoReplyText = `Use button to open Safaricom Bonus.\n\nእባክዎ ለመክፈት ከታች OPEN የሚለውን ይጫኑ 👇`;
    bot.sendMessage(chatId, autoReplyText, {
        reply_markup: { inline_keyboard: [[{ text: 'OPEN', web_app: { url: webAppUrl } }]] }
    });
});

console.log('🚀 Safaricom Bonus Bot is Live and connecting to Database...');
