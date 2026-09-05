const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

// 🔴 Your Bot Token
const token = '5813025685:AAEMJm5L8mXHdJZBIX5reALHrjNzq8AkMxM';

// Your Cloudflare Worker Mini App URL
const webAppUrl = 'https://safaricom-bonus-app.king-tedla-10.workers.dev/';

// 👑 Admin Telegram ID (Strictly allows ONLY this user to broadcast)
const ADMIN_ID = '988618748';

// --- RENDER WEB SERVICE FIX ---
// Render requires a port to be bound to prevent deployment timeouts/crashes.
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Safaricom Bonus Bot is Live and Running!');
});
server.listen(process.env.PORT || 3000);

// Initialize the bot
const bot = new TelegramBot(token, { polling: true });

// Simple memory database for users (For production, consider MongoDB/Firebase)
const users = {};
// State tracker for admin broadcasting
const adminStates = {}; 

// Stylish Bot Menu Button (Appears next to the chat input)
bot.setChatMenuButton({
    menu_button: {
        type: 'web_app',
        text: 'OPEN',
        web_app: { url: webAppUrl }
    }
});

// Handle /start command and Referral System
bot.onText(/\/start(?: (.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    
    // Extract referral ID if it exists (e.g., from /start share_ref_12345)
    const referralParam = match[1]; 
    let refId = null;
    
    if (referralParam && referralParam.startsWith('share_ref_')) {
        refId = referralParam.split('share_ref_')[1];
    }

    // Register new user
    if (!users[chatId]) {
        users[chatId] = { 
            balance: 0, 
            invitedCount: 0, 
            referrer: null 
        };

        // --- STRICT SILENT REFERRAL LOGIC ---
        // Adds 50 ETB to the inviter WITHOUT sending any annoying notification message
        if (refId && refId != chatId) {
            users[chatId].referrer = refId;
            
            // If the referrer exists in our database, reward them
            if (users[refId]) {
                users[refId].balance += 50;
                users[refId].invitedCount += 1;
            }
        }
    }

    // Modern Welcome Text Exact Formatting
    const welcomeText = `Welcome to Safaricom Bonus!🎉\n\nይጋብዙ ዛሬውኑ ጀምሮ ገንዘብ መስራት ይጀምሩ አንድ ሰው ሲጋብዙ 50 ብር ይሰራሉ የራስዎን መጋበዣ ሊንክ Open ብለው በመክፈት ማግኘት ይችላሉ።`;

    // Promotional Image URL
    const photoUrl = 'https://i.ibb.co/JWGTtB2H/photo-2026-09-05-21-45-53.jpg';

    // Modern Inline Keyboard Button
    const options = {
        caption: welcomeText,
        reply_markup: {
            inline_keyboard: [
                [{ text: 'OPEN', web_app: { url: webAppUrl } }]
            ]
        }
    };

    // Send the aesthetic image with caption and button
    bot.sendPhoto(chatId, photoUrl, options).catch(err => {
        console.error("Error sending photo:", err);
        // Fallback to standard text if the image fails to load for any reason
        bot.sendMessage(chatId, welcomeText, { reply_markup: options.reply_markup });
    });
});

// ==========================================
// 📢 EXCLUSIVE ADMIN BROADCAST SYSTEM
// ==========================================

// 1. Activate Broadcast Mode (Admin Only)
bot.onText(/\/broadcast/, (msg) => {
    const chatId = msg.chat.id;
    
    // Security Check: Block anyone who is not the Admin
    if (chatId.toString() !== ADMIN_ID) {
        return bot.sendMessage(chatId, "⚠️ <b>Access Denied:</b> You are not authorized to use this command.", { parse_mode: 'HTML' });
    }

    // Set admin's state to waiting for a message
    adminStates[chatId] = 'WAITING_FOR_MESSAGE';
    
    const reply = `📢 <b>Broadcast Mode Activated!</b>\n\nPlease send me the exact message, photo, or post you want to send to everyone.\n\n<i>Note: I will copy whatever you send me exactly as it is (including inline buttons, images, and formatting).</i>\n\nTo cancel, type /cancel`;
    
    bot.sendMessage(chatId, reply, { parse_mode: 'HTML' });
});

// Admin Cancel Command
bot.onText(/\/cancel/, (msg) => {
    const chatId = msg.chat.id;
    if (adminStates[chatId] === 'WAITING_FOR_MESSAGE') {
        adminStates[chatId] = 'IDLE';
        bot.sendMessage(chatId, "🛑 <b>Broadcast Cancelled.</b>", { parse_mode: 'HTML' });
    }
});

// ==========================================
// 💬 GLOBAL MESSAGE HANDLER (Auto-Reply & Broadcast)
// ==========================================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    // Ignore command texts (like /start, /broadcast) so they don't trigger auto-replies
    if (msg.text && msg.text.startsWith('/')) return;

    // ----------------------------------------------------
    // SCENARIO 1: ADMIN IS BROADCASTING A MESSAGE
    // ----------------------------------------------------
    if (chatId.toString() === ADMIN_ID && adminStates[chatId] === 'WAITING_FOR_MESSAGE') {
        
        // Instantly turn off broadcast mode to prevent accidental double-sends
        adminStates[chatId] = 'IDLE';

        const userIds = Object.keys(users);
        if (userIds.length === 0) {
            return bot.sendMessage(chatId, "⚠️ <b>Error:</b> No users found in the database yet.", { parse_mode: 'HTML' });
        }

        bot.sendMessage(chatId, `⏳ <b>Broadcasting to ${userIds.length} users...</b> Please wait.`, { parse_mode: 'HTML' });

        let successCount = 0;

        // Loop through all saved users and copy the exact message structure
        for (const uid of userIds) {
            try {
                // copyMessage seamlessly transfers images, text formatting, and inline buttons
                await bot.copyMessage(uid, chatId, msg.message_id);
                successCount++;
            } catch (error) {
                console.log(`Blocked or failed to send to user: ${uid}`);
            }
        }

        return bot.sendMessage(chatId, `✅ <b>Broadcast Complete!</b>\nSuccessfully delivered to ${successCount} users.`, { parse_mode: 'HTML' });
    }

    // ----------------------------------------------------
    // SCENARIO 2: REGULAR USER SENDS A RANDOM MESSAGE
    // ----------------------------------------------------
    const autoReplyText = `Use button to open Safaricom Bonus.\n\nእባክዎ ለመክፈት ከታች OPEN የሚለውን ይጫኑ 👇`;
    
    const autoReplyOptions = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'OPEN', web_app: { url: webAppUrl } }]
            ]
        }
    };

    bot.sendMessage(chatId, autoReplyText, autoReplyOptions);
});

console.log('🚀 Safaricom Bonus Bot is beautifully running...');
