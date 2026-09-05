const TelegramBot = require('node-telegram-bot-api');

// 🔴 Replace with your actual bot token from BotFather
const token = 'YOUR_TELEGRAM_BOT_TOKEN_HERE';

// Your Cloudflare Worker Mini App URL
const webAppUrl = 'https://safaricom-bonus-app.king-tedla-10.workers.dev/';

// Initialize the bot
const bot = new TelegramBot(token, { polling: true });

// Simple database (For production, connect this to MongoDB or Firebase)
const users = {};

// Stylish Bot Menu Button (Appears next to the chat input)
bot.setChatMenuButton({
    menu_button: {
        type: 'web_app',
        text: '🌟 Open',
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

        // --- SILENT REFERRAL LOGIC ---
        // If they were invited by someone, add 50 ETB to the inviter silently
        if (refId && refId != chatId) {
            users[chatId].referrer = refId;
            
            // If the referrer exists in our database, reward them
            if (users[refId]) {
                users[refId].balance += 50;
                users[refId].invitedCount += 1;
                
                // 🛑 NO NOTIFICATION SENT HERE! 
                // The balance is updated silently to avoid annoying the inviter.
            }
        }
    }

    // Aesthetic, Premium Welcome Message (Used as image caption)
    const welcomeText = `Welcome to Safaricom Bonus!🎉\n\nይጋብዙ ዛሬውኑ ጀምሮ ገንዘብ መስራት ይጀምሩ አንድ ሰው ሲጋብዙ 50 ብር ይሰራሉ የራስዎን መጋበዣ ሊንክ OPEN ብለው በመክፈት ማግኘት ይችላሉ።`;

    // The promotional image URL you provided
    const photoUrl = 'https://i.ibb.co/JWGTtB2H/photo-2026-09-05-21-45-53.jpg';

    // Modern Inline Keyboard Button & Options
    const options = {
        caption: welcomeText,
        reply_markup: {
            inline_keyboard: [
                [{ text: '🌟 Open', web_app: { url: webAppUrl } }]
            ]
        }
    };

    // Send the aesthetic image with the caption and button
    bot.sendPhoto(chatId, photoUrl, options).catch(err => {
        console.error("Error sending photo:", err);
        // Fallback to text if the image fails to load
        bot.sendMessage(chatId, welcomeText, {
            reply_markup: options.reply_markup
        });
    });
});

// Log to console so you know it's running
console.log('🚀 Safaricom Bonus Bot is beautifully running...');
