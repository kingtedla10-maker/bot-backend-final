const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const admin = require('firebase-admin');

// 🔴 Your Active Bot Token
const token = '5813025685:AAGcePDBDdny0I5yMnPfNq1jd3EF8uRG7tg';
const webAppUrl = 'https://safaricom-bonus-app.king-tedla-10.workers.dev/';
const ADMIN_ID = '988618748';

// 🔴 Initialize Firebase Database
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

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
        
        if (!userId) {
            res.writeHead(400);
            return res.end('Missing User ID');
        }

        // Fetch real-time balance from Firebase
        const userRef = db.collection('users').doc(userId);
        const doc = await userRef.get();
        const userData = doc.exists ? doc.data() : { balance: 0, invitedCount: 0 };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ balance: userData.balance || 0, invitedCount: userData.invitedCount || 0 }));
        return;
    }

    res.writeHead(200);
    res.end('Safaricom Bonus Bot (Firebase Edition) is Live.');
});
server.listen(process.env.PORT || 3000);

const bot = new TelegramBot(token, { polling: true });

bot.setChatMenuButton({
    menu_button: { type: 'web_app', text: 'OPEN', web_app: { url: webAppUrl } }
});

// ==========================================
// 🚀 FIREBASE REFERRAL TRACKING SYSTEM
// ==========================================
bot.onText(/\/start(?: (.*))?/, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    const referralParam = match[1]; 
    let refId = null;
    
    if (referralParam && referralParam.startsWith('share_ref_')) {
        refId = referralParam.split('share_ref_')[1];
    }

    // Connect to the specific user's document in Firebase
    const userRef = db.collection('users').doc(chatId);
    const doc = await userRef.get();

    // If user is brand new
    if (!doc.exists) {
        await userRef.set({ balance: 0, invitedCount: 0, referrer: refId || null });

        // Add 50 ETB to the inviter
        if (refId && refId !== chatId) {
            const referrerRef = db.collection('users').doc(refId);
            const refDoc = await referrerRef.get();
            
            if (refDoc.exists) {
                // Increment existing balance
                await referrerRef.update({
                    balance: admin.firestore.FieldValue.increment(50),
                    invitedCount: admin.firestore.FieldValue.increment(1)
                });
            } else {
                // Create inviter if they somehow don't exist yet
                await referrerRef.set({ balance: 50, invitedCount: 1, referrer: null });
            }
            console.log(`User ${refId} earned 50 ETB!`);
        }
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
        
        // Fetch all users from Firebase
        const usersSnapshot = await db.collection('users').get();
        bot.sendMessage(chatId, `⏳ <b>Broadcasting to ${usersSnapshot.size} users...</b>`, { parse_mode: 'HTML' });
        
        let successCount = 0;
        usersSnapshot.forEach(async (userDoc) => {
            try {
                await bot.copyMessage(userDoc.id, chatId, msg.message_id);
                successCount++;
            } catch (error) { }
        });
        
        // Brief delay to allow messages to process
        setTimeout(() => {
            bot.sendMessage(chatId, `✅ <b>Broadcast Complete!</b>\nDelivered to ${successCount} users.`, { parse_mode: 'HTML' });
        }, 2000);
        return;
    }

    const autoReplyText = `Use button to open Safaricom Bonus.\n\nእባክዎ ለመክፈት ከታች OPEN የሚለውን ይጫኑ 👇`;
    bot.sendMessage(chatId, autoReplyText, {
        reply_markup: { inline_keyboard: [[{ text: 'OPEN', web_app: { url: webAppUrl } }]] }
    });
});

console.log('🚀 Safaricom Bonus Bot is Live and connecting to Firebase...');
