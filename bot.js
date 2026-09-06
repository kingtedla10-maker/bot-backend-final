require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const admin = require('firebase-admin');

// Environment Variables
const token = process.env.TELEGRAM_BOT_TOKEN;
const webAppUrl = process.env.MINI_APP_URL;
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;
const welcomeImageUrl = process.env.WELCOME_IMAGE_URL || 'https://i.ibb.co/8L4rTN4K/photo-2026-09-04-10-50-08.jpg';
const referralReward = Number(process.env.REFERRAL_REWARD) || 50;

// Initialize Firebase
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const adminStates = {}; 

// ==========================================
// 🌐 API BRIDGE & RENDER WEB SERVICE
// ==========================================
const server = http.createServer(async (req, res) => {
    // CORS Headers for Cloudflare Web App
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    // 1. FETCH USER DATA (Balance, Invites, Bonus Status)
    if (req.url.startsWith('/api/user') && req.method === 'GET') {
        const baseURL = `http://${req.headers.host || 'localhost'}`;
        const parsedUrl = new URL(req.url, baseURL);
        const userId = parsedUrl.searchParams.get('id');
        
        if (!userId) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'Missing User ID' }));
        }

        const userRef = db.collection('users').doc(userId);
        const doc = await userRef.get();
        const userData = doc.exists ? doc.data() : { balance: 0, invitedCount: 0, bonusClaimed: false };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ 
            balance: userData.balance || 0, 
            invitedCount: userData.invitedCount || 0,
            bonusClaimed: userData.bonusClaimed || false
        }));
    }

    // 2. SECURE 100 ETB BONUS CLAIM (One-time only)
    if (req.url.startsWith('/api/claim') && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const userId = data.id;
                
                if (!userId) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'Missing User ID' }));
                }

                const userRef = db.collection('users').doc(userId);
                const doc = await userRef.get();
                
                if (!doc.exists) {
                    // Create user if they somehow bypassed start
                    await userRef.set({ balance: 100, invitedCount: 0, bonusClaimed: true });
                } else {
                    const userData = doc.data();
                    if (userData.bonusClaimed) {
                        res.writeHead(400);
                        return res.end(JSON.stringify({ success: false, message: 'Bonus already claimed' }));
                    }
                    // Add 100 ETB and lock the bonus
                    await userRef.update({
                        balance: admin.firestore.FieldValue.increment(100),
                        bonusClaimed: true
                    });
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true, newBalance: (doc.exists ? doc.data().balance + 100 : 100) }));
            } catch (error) {
                res.writeHead(500);
                return res.end(JSON.stringify({ success: false, error: 'Server Error' }));
            }
        });
        return;
    }

    res.writeHead(200);
    res.end('Safaricom Bonus Bot API is Live.');
});

server.listen(process.env.PORT || 3000);

// ==========================================
// 🚀 PERMANENT REFERRAL TRACKING SYSTEM
// ==========================================
const bot = new TelegramBot(token, { polling: true });

bot.setChatMenuButton({
    menu_button: { type: 'web_app', text: 'Open', web_app: { url: webAppUrl } }
});

bot.onText(/\/start(?: (.*))?/, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    const referralParam = match[1]; 
    let refId = null;
    
    if (referralParam && referralParam.startsWith('share_ref_')) {
        refId = referralParam.split('share_ref_')[1];
    }

    const userRef = db.collection('users').doc(chatId);
    const doc = await userRef.get();

    // If user is brand new
    if (!doc.exists) {
        await userRef.set({ balance: 0, invitedCount: 0, referrer: refId || null, bonusClaimed: false });

        // Reward the inviter permanently
        if (refId && refId !== chatId) {
            const referrerRef = db.collection('users').doc(refId);
            const refDoc = await referrerRef.get();
            
            if (refDoc.exists) {
                await referrerRef.update({
                    balance: admin.firestore.FieldValue.increment(referralReward),
                    invitedCount: admin.firestore.FieldValue.increment(1)
                });
            } else {
                await referrerRef.set({ balance: referralReward, invitedCount: 1, referrer: null, bonusClaimed: false });
            }
        }
    }

    const welcomeText = `Welcome to Safaricom Bonus!\n\nይጋብዙ ዛሬውኑ ጀምሮ ገንዘብ መስራት ይጀምሩ አንድ ሰው ሲጋብዙ ${referralReward} ብር ይሰራሉ የራስዎን መጋበዣ ሊንክ OPEN ብለው በመክፈት ማግኘት ይችላሉ።`;
    const options = {
        caption: welcomeText,
        reply_markup: { inline_keyboard: [[{ text: 'Open', web_app: { url: webAppUrl } }]] }
    };

    bot.sendPhoto(chatId, welcomeImageUrl, options).catch(err => {
        bot.sendMessage(chatId, welcomeText, { reply_markup: options.reply_markup });
    });
});

// Admin Broadcast
bot.onText(/\/broadcast/, (msg) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== ADMIN_ID) return;
    adminStates[chatId] = 'WAITING_FOR_MESSAGE';
    bot.sendMessage(chatId, `📢 <b>Broadcast Mode Activated!</b>\nPlease send me the exact message/photo to send everyone.\nTo cancel, type /cancel`, { parse_mode: 'HTML' });
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
        const usersSnapshot = await db.collection('users').get();
        bot.sendMessage(chatId, `⏳ <b>Broadcasting to ${usersSnapshot.size} users...</b>`, { parse_mode: 'HTML' });
        
        let successCount = 0;
        usersSnapshot.forEach(async (userDoc) => {
            try {
                await bot.copyMessage(userDoc.id, chatId, msg.message_id);
                successCount++;
            } catch (error) { }
        });
        
        setTimeout(() => {
            bot.sendMessage(chatId, `✅ <b>Broadcast Complete!</b>\nDelivered to ${successCount} users.`, { parse_mode: 'HTML' });
        }, 2000);
        return;
    }

    bot.sendMessage(chatId, `Use button to open Safaricom Bonus.\n\nእባክዎ ለመክፈት ከታች OPEN የሚለውን ይጫኑ 👇`, {
        reply_markup: { inline_keyboard: [[{ text: 'Open', web_app: { url: webAppUrl } }]] }
    });
});

console.log('🚀 Safaricom Bonus Bot is Live with Full DB Integration!');
