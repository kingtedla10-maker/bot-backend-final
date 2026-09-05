const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

// 🔴 Your actual bot token
const token = '5813025685:AAEMJm5L8mXHdJZBIX5reALHrjNzq8AkMxM';

// Your Cloudflare Worker Mini App URL
const webAppUrl = 'https://safaricom-bonus-app.king-tedla-10.workers.dev/';

// --- RENDER WEB SERVICE FIX ---
// Render requires a port to be bound. This dummy server prevents deployment crashes.
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Safaricom Bonus Bot is Live and Running!');
});
server.listen(process.env.PORT || 3000);

// Initialize the bot
const bot = new TelegramBot(token, { polling: true });

// Simple memory database for users
const users = {};
// State tracker for broadcasting
const adminStates = {}; 

// Stylish Bot Menu Button
bot.setChatMenuButton({
    menu_button: {
        type: 'web_app',
        text: 'Open',
        web_app: { url: webAppUrl }
    }
});

// Handle /start command and Referral System
bot.onText(/\/start(?: (.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    
    // Extract referral ID if it exists
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
            
            if (users[refId]) {
                users[refId].balance += 50;
                users[refId].invitedCount += 1;
            }
        }
    }

    // Modern Welcome Text Exact Formatting
    const welcomeText = `Welcome to Safaricom Bonus!🎉\n\nይጋብዙ ዛሬውኑ ጀምሮ ገንዘብ መስራት ይጀምሩ አንድ ሰው ሲጋብዙ 50 ብር ይሰራሉ የራስዎን መጋበዣ ሊንክ OPEN ብለው በመክፈት ማግኘት ይችላሉ።`;

    // Promotional Image URL
    const photoUrl = 'https://i.ibb.co/JWGTtB2H/photo-2026-09-05-21-45-53.jpg';

    // Modern Inline Keyboard Button
    const options = {
        caption: welcomeText,
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Open', web_app: { url: webAppUrl } }]
            ]
        }
    };

    // Send the aesthetic image with caption and button
    bot.sendPhoto(chatId, photoUrl, options).catch(err => {
        console.error("Error sending photo:", err);
        bot.sendMessage(chatId, welcomeText, { reply_markup: options.reply_markup });
    });
});

// ==========================================
// 📢 PROFESSIONAL BROADCAST SYSTEM
// ==========================================

// 1. Activate Broadcast Mode
bot.onText(/\/broadcast/, (msg) => {
    const chatId = msg.chat.id;
    
    // Set this admin's state to waiting for a message
    adminStates[chatId] = 'WAITING_FOR_MESSAGE';
    
    const reply = `📢 *Broadcast Mode Activated!*\n\nPlease send me the exact message, photo, or post you want to send to everyone. \n\n_Note: I will copy whatever you send me exactly as it is (including any inline buttons or pictures)._`;
    
    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
});

// 2. Catch the message and broadcast it
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    // Ignore if it's just a standard command like /start or /broadcast
    if (msg.text && msg.text.startsWith('/')) return;

    // Check if this specific user is in broadcast mode
    if (adminStates[chatId] === 'WAITING_FOR_MESSAGE') {
        
        // Instantly turn off broadcast mode so they don't accidentally send multiple
        adminStates[chatId] = 'IDLE';

        const userIds = Object.keys(users);
        if (userIds.length === 0) {
            return bot.sendMessage(chatId, "⚠️ *Error:* No users found in the database yet.", { parse_mode: 'Markdown' });
        }

        bot.sendMessage(chatId, `⏳ *Broadcasting to ${userIds.length} users...* Please wait.`, { parse_mode: 'Markdown' });

        let successCount = 0;

        // Loop through all saved users and copy the message
        for (const uid of userIds) {
            try {
                // copyMessage seamlessly transfers images, text, and buttons exactly as designed
                await bot.copyMessage(uid, chatId, msg.message_id);
                successCount++;
            } catch (error) {
                console.log(`Blocked or failed to send to user: ${uid}`);
            }
        }

        bot.sendMessage(chatId, `✅ *Broadcast Complete!*\nSuccessfully delivered to ${successCount} users.`, { parse_mode: 'Markdown' });
    }
});

console.log('🚀 Safaricom Bonus Bot is beautifully running...');
