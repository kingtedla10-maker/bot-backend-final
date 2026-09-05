'use strict';

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// ==========================================
// RENDER.COM DUMMY WEB SERVER
// ==========================================
const app = express();
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Safaricom Bonus Bot is alive!');
});

app.listen(port, () => {
    console.log(`🌐 Dummy server listening on port ${port} to keep Render awake.`);
});

// ==========================================
// FIREBASE
// ==========================================
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// ==========================================
// 1. CONFIGURATION (HARDCODED IMAGES)
// ==========================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
const BOT_USERNAME = process.env.BOT_USERNAME || 'Safaricom_BonusBot';
const REFERRAL_REWARD = parseInt(process.env.REFERRAL_REWARD) || 50;

// Fallback in case the environment variable still has markdown
let rawMiniAppUrl = process.env.MINI_APP_URL || 'https://safaricom-bonus-app.king-tedla-10.workers.dev';
const urlMatch = rawMiniAppUrl.match(/https?:\/\/[^\s"'<>\])]+/);
const MINI_APP_URL = urlMatch ? urlMatch[0] : rawMiniAppUrl;

// 📸 HARDCODED EXACT IMAGE URLS (Bypasses Render Env Var errors perfectly)
const WELCOME_PHOTO_URL = "https://i.ibb.co/8L4rTN4K/photo-2026-09-04-10-50-08.jpg";
const SHARE_PHOTO_URL = "https://i.ibb.co/8L4rTN4K/photo-2026-09-04-10-50-08.jpg";
const NOTIFY_PHOTO_URL = "https://i.ibb.co/G4GqgZgT/photo-2026-09-04-21-33-51.jpg";

if (!TELEGRAM_BOT_TOKEN || !ADMIN_TELEGRAM_ID) {
    console.error('❌ Missing core environment variables in .env or Render');
    process.exit(1);
}

// ==========================================
// 2. FIREBASE CONNECTION
// ==========================================
try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined;

    if (!projectId || !clientEmail || !privateKey) {
        throw new Error("Missing Firebase credentials.");
    }

    initializeApp({
        credential: cert({
            projectId: projectId,
            clientEmail: clientEmail,
            privateKey: privateKey
        })
    });
    console.log('✅ Firebase initialized successfully');
} catch (error) {
    console.error('❌ Firebase initialization failed:', error.message);
    process.exit(1);
}

const db = getFirestore();

// ==========================================
// 3. TELEGRAM BOT SETUP
// ==========================================
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
console.log('🚀 Starting Safaricom Bonus Bot...');

// ==========================================
// 4. HELPER FUNCTIONS
// ==========================================
function getPrivateUserId(msg) {
    return (msg.from?.id?.toString() || msg.chat?.id?.toString());
}

function createReferralLink(userId) {
    return `https://t.me/${BOT_USERNAME}?start=share_ref_${userId}`;
}

function isValidTelegramId(id) {
    return /^\d{1,20}$/.test(String(id));
}

function extractReferralId(payload) {
    if (!payload) return null;
    const match = String(payload).match(/^(?:share_)?ref_(\d{1,20})$/);
    return match ? match[1] : null;
}

function getFormattedText() {
    return `<b>Welcome to Safaricom Bonus!🎉</b>\n\nይጋብዙ ዛሬውኑ ጀምሮ ገንዘብ መስራት ይጀምሩ አንድ ሰው ሲጋብዙ 50 ብር ይሰራሉ የራስዎን መጋበዣ ሊንክ OPEN ብለው በመክፈት ማግኘት ይችላሉ።`;
}

// ==========================================
// 5. START COMMAND + REFERRAL SYSTEM
// ==========================================
bot.onText(/^\/start(?:\s+(.+))?$/, async (msg, match) => {
    const userId = getPrivateUserId(msg);
    if (!userId || msg.chat.type !== 'private') return;

    const payload = match?.[1]?.trim() || null;
    const userRef = db.collection('users').doc(userId);

    try {
        await db.runTransaction(async (transaction) => {
            const userSnapshot = await transaction.get(userRef);

            // User already exists
            if (userSnapshot.exists) return;

            const newUserData = {
                balance: 0,
                invitedCount: 0,
                hasClaimedWelcome: false,
                joinedDate: FieldValue.serverTimestamp()
            };

            const inviterId = extractReferralId(payload);

            if (!inviterId || inviterId === userId) {
                transaction.set(userRef, newUserData);
                return;
            }

            const inviterRef = db.collection('users').doc(inviterId);
            const inviterSnapshot = await transaction.get(inviterRef);

            if (!inviterSnapshot.exists) {
                transaction.set(userRef, newUserData);
                return;
            }

            // Create new user linked to inviter
            transaction.set(userRef, {
                ...newUserData,
                referredBy: inviterId,
                referralRewardGranted: true
            });

            // Reward Inviter
            transaction.update(inviterRef, {
                balance: FieldValue.increment(REFERRAL_REWARD),
                invitedCount: FieldValue.increment(1),
                lastReferralDate: FieldValue.serverTimestamp()
            });

            // Save referral record
            const referralRef = db.collection('referrals').doc(`${inviterId}_${userId}`);
            transaction.set(referralRef, {
                inviterId: inviterId,
                invitedUserId: userId,
                reward: REFERRAL_REWARD,
                createdAt: FieldValue.serverTimestamp()
            }, { merge: true });
        });

        // ----------------------------------------------------
        // SEND WELCOME MESSAGE WITH HARDCODED PHOTO
        // ----------------------------------------------------
        const welcomeText = getFormattedText();

        try {
            await bot.sendPhoto(userId, WELCOME_PHOTO_URL, {
                caption: welcomeText,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { 
                                text: 'Open', 
                                web_app: { url: MINI_APP_URL } 
                            }
                        ]
                    ]
                }
            });
        } catch (photoError) {
            console.error('❌ Error sending welcome photo (falling back to text):', photoError.message);
            await bot.sendMessage(userId, welcomeText, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: 'Open', web_app: { url: MINI_APP_URL } }]] }
            }).catch(()=>{});
        }

        // ----------------------------------------------------
        // NOTIFY INVITER
        // ----------------------------------------------------
        if (payload) {
            const referralId = extractReferralId(payload);
            if (referralId && referralId !== userId) {
                const referralRef = db.collection('referrals').doc(`${referralId}_${userId}`);
                const referralSnapshot = await referralRef.get();

                if (referralSnapshot.exists) {
                    try {
                        await bot.sendPhoto(referralId, NOTIFY_PHOTO_URL, {
                            caption: `🎉 እንኳን ደስ አለዎት ጓደኛዎ በእርስዎ መጋበዣ ሊንክ ተመዝግብቧል ወደ እርስዎ ዋሌት ተጨማሪ +50 ብር ገቢ ተደርጓል።`,
                            parse_mode: 'HTML',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: 'Check', web_app: { url: MINI_APP_URL } }]
                                ]
                            }
                        });
                    } catch (notifyError) {
                        console.error('❌ Could not notify inviter:', notifyError.message);
                    }
                }
            }
        }

    } catch (error) {
        console.error('❌ START COMMAND ERROR:', error.message);
        bot.sendMessage(userId, '❌ Something went wrong processing your request. Please try again.').catch(() => {});
    }
});

// ==========================================
// 6. INLINE SHARE MODE
// ==========================================
bot.on('inline_query', async (query) => {
    const queryId = query.id;
    const queryText = (query.query || '').trim();

    if (!queryText.startsWith('share_ref_')) {
        return bot.answerInlineQuery(queryId, [], { cache_time: 0, is_personal: true }).catch(()=>{});
    }

    const referrerId = queryText.substring('share_ref_'.length);

    if (!isValidTelegramId(referrerId)) {
        return bot.answerInlineQuery(queryId, [], { cache_time: 0, is_personal: true }).catch(()=>{});
    }

    const shareText = getFormattedText();
    const resultId = `share_${referrerId}_${Date.now()}`;
    const uniqueShareLink = createReferralLink(referrerId);

    const results = [
        {
            type: 'photo',
            id: resultId,
            photo_url: SHARE_PHOTO_URL,
            thumbnail_url: SHARE_PHOTO_URL,
            title: '🎁 Safaricom Bonus',
            description: 'Invite your friends and earn 50 ETB.',
            caption: shareText,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Open', url: uniqueShareLink }]
                ]
            }
        }
    ];

    try {
        await bot.answerInlineQuery(queryId, results, { cache_time: 0, is_personal: true, next_offset: '' });
    } catch (error) {
        console.error('❌ INLINE QUERY ERROR:', error.message);
        bot.answerInlineQuery(queryId, [], { cache_time: 0, is_personal: true }).catch(()=>{});
    }
});

// ==========================================
// 7. NORMAL TEXT MESSAGE FALLBACK
// ==========================================
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    if (!msg.text) return;

    const chatId = msg.chat.id.toString();
    const userId = getPrivateUserId(msg);
    if (!userId) return;

    try {
        await bot.sendMessage(chatId, `Use button to open Safaricom Bonus.\n\nእባክዎ ለመክፈት ከታች OPEN የሚለውን ይጫኑ 👇`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Open', web_app: { url: MINI_APP_URL } }]
                ]
            }
        });
    } catch (error) {}
});

// ==========================================
// 8. BROADCAST
// ==========================================
bot.onText(/^\/broadcast\s+([\s\S]+)$/, async (msg, match) => {
    const adminId = msg.from?.id?.toString();
    const messageToSend = match?.[1]?.trim();

    if (!adminId || adminId !== ADMIN_TELEGRAM_ID) return;
    if (!messageToSend) return;

    try {
        await bot.sendMessage(msg.chat.id, '⏳ Broadcasting message to all users...');
        const usersSnapshot = await db.collection('users').get();
        let successCount = 0;

        for (const doc of usersSnapshot.docs) {
            try {
                await bot.sendMessage(doc.id, `📢 <b>Safaricom Bonus Update:</b>\n\n${messageToSend}`, { parse_mode: 'HTML' });
                successCount++;
            } catch (error) {} // Ignore blocked
        }
        await bot.sendMessage(msg.chat.id, `✅ Broadcast complete!\nSuccessfully sent to ${successCount} users.`);
    } catch (error) {
        console.error('❌ Broadcast failed:', error);
    }
});

bot.on('polling_error', (error) => {
    console.error('❌ Telegram polling error:', error.message);
});
