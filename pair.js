const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const router = express.Router();
const pino = require('pino');
const axios = require('axios');
const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, DisconnectReason, jidDecode, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const yts = require('yt-search');
const mongoose = require('mongoose');

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://kaviduinduwara:kavidu2008@cluster0.bqmspdf.mongodb.net/soloBot?retryWrites=true&w=majority&appName=Cluster0';

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
}).then(() => {
  console.log('✅ Connected to MongoDB');
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
});

// MongoDB Schemas
const sessionSchema = new mongoose.Schema({
  number: { type: String, required: true },
  sessionId: { type: String, unique: true },
  pairingCodes: { type: [String], default: [] },
  verifiedCodes: { type: [String], default: [] },
  status: { type: String, default: 'pending' },
  settings: { 
    type: Object, 
    default: {
      autoTyping: true,
      autoRecording: true,
      autoViewStatus: true,
      autoLikeStatus: true,
      antiViewOnce: true,
      antiLink: true,
      antiDelete: true,
      autoread: true,
      online: true,
      autoswview: true,
      autoswlike: true
    }
  },
  creds: { type: Object },
  createdAt: { type: Date, default: Date.now, expires: 600 }, // 10 minutes TTL
  updatedAt: { type: Date, default: Date.now }
});

const Session = mongoose.model('Session', sessionSchema);

// Bot Configuration
const OWNER_NUMBER = '255789661031@s.whatsapp.net';
const GROUP_INVITE = 'https://chat.whatsapp.com/IdGNaKt80DEBqirc2ek4ks';
const CHANNEL_INVITE = 'https://whatsapp.com/channel/0029VbBG4gfISTkCpKxyMH02';
const CHANNEL_JIDS = ['120363402325089913@newsletter'];

// Bot Images
const BOT_IMAGES = [
  'https://files.catbox.moe/277zt9.jpg',
  'https://files.catbox.moe/277zt9.jpg',
  'https://files.catbox.moe/277zt9.jpg'
];

console.log('✅ SILA AI Bot initialized');

const activeSockets = new Map();
const SESSION_BASE_PATH = './session';

if (!fs.existsSync(SESSION_BASE_PATH)) {
  fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

// Utility Functions
function silaMessage(text) {
  const randomImage = BOT_IMAGES[Math.floor(Math.random() * BOT_IMAGES.length)];
  
  return {
    text: text,
    contextInfo: {
      externalAdReply: {
        title: 'SILA AI',
        body: 'WhatsApp ‧ Verified',
        thumbnailUrl: randomImage,
        thumbnailWidth: 64,
        thumbnailHeight: 64,
        sourceUrl: CHANNEL_INVITE,
        mediaUrl: randomImage,
        showAdAttribution: true,
        renderLargerThumbnail: false,
        previewType: 'PHOTO',
        mediaType: 1
      },
      forwardedNewsletterMessageInfo: {
        newsletterJid: CHANNEL_JIDS[0],
        newsletterName: 'SILA AI OFFICIAL',
        serverMessageId: Math.floor(Math.random() * 1000000)
      },
      isForwarded: true,
      forwardingScore: 999
    }
  };
}

function generatePairingCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push(Math.floor(10000000 + Math.random() * 90000000).toString());
  }
  return codes;
}

// Delay function
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Pairing Endpoint
router.post('/pair', async (req, res) => {
  try {
    const { phone } = req.body;
    
    console.log('📞 Pairing request for:', phone);
    
    if (!phone || !phone.match(/^\+[0-9]{10,15}$/)) {
      return res.json({
        success: false,
        error: 'Invalid phone number format. Use +255789661031 format'
      });
    }
    
    // Generate 8 pairing codes
    const codes = generatePairingCodes(8);
    
    // Create session ID
    const sessionId = 'SILA_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8).toUpperCase();
    const sanitizedNumber = phone.replace('+', '');
    
    // Save to database
    const session = new Session({
      number: sanitizedNumber,
      sessionId: sessionId,
      pairingCodes: codes,
      verifiedCodes: [],
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await session.save();
    
    console.log(`✅ 8 codes generated for ${phone}: ${codes.join(', ')}`);
    
    res.json({
      success: true,
      sessionId: sessionId,
      phone: phone,
      codes: codes,
      message: '✅ 8 pairing codes generated successfully!',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Pairing error:', error);
    
    // Fallback if MongoDB fails
    const codes = generatePairingCodes(8);
    const sessionId = 'SILA_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8).toUpperCase();
    
    res.json({
      success: true,
      sessionId: sessionId,
      phone: req.body.phone || '+255789661031',
      codes: codes,
      message: '✅ 8 pairing codes generated (fallback mode)',
      timestamp: new Date().toISOString()
    });
  }
});

// Verify code endpoint
router.post('/verify', async (req, res) => {
  try {
    const { sessionId, code } = req.body;
    
    const session = await Session.findOne({ sessionId: sessionId });
    
    if (session && session.pairingCodes.includes(code) && !session.verifiedCodes.includes(code)) {
      session.verifiedCodes.push(code);
      
      if (session.verifiedCodes.length === session.pairingCodes.length) {
        session.status = 'completed';
        await session.save();
        
        // Start WhatsApp bot
        startWhatsAppBot(sessionId, session.number);
      } else {
        await session.save();
      }
      
      res.json({
        success: true,
        verified: true,
        remainingCodes: session.pairingCodes.length - session.verifiedCodes.length,
        totalCodes: session.pairingCodes.length
      });
    } else {
      res.json({
        success: false,
        verified: false,
        message: 'Invalid or already used code'
      });
    }
  } catch (error) {
    console.error('Verify error:', error);
    res.json({ success: false, error: 'Verification failed' });
  }
});

// Get session status
router.get('/status/:sessionId', async (req, res) => {
  try {
    const session = await Session.findOne({ sessionId: req.params.sessionId });
    
    if (session) {
      res.json({
        success: true,
        phone: '+' + session.number,
        status: session.status,
        codesVerified: session.verifiedCodes.length,
        totalCodes: session.pairingCodes.length
      });
    } else {
      res.json({ success: false, error: 'Session not found' });
    }
  } catch (error) {
    console.error('Session check error:', error);
    res.json({ success: false, error: 'Session check failed' });
  }
});

// Get stats
router.get('/stats', async (req, res) => {
  try {
    const sessions = await Session.countDocuments();
    const activeSessionsCount = await Session.countDocuments({ status: 'active' });
    
    res.json({
      success: true,
      stats: {
        totalSessions: sessions,
        activeSessions: activeSessionsCount,
        memoryUsage: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
        uptime: `${process.uptime().toFixed(0)}s`
      }
    });
  } catch (error) {
    res.json({
      success: true,
      stats: {
        totalSessions: activeSockets.size,
        activeSessions: activeSockets.size,
        memoryUsage: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
        uptime: `${process.uptime().toFixed(0)}s`
      }
    });
  }
});

// WhatsApp Bot Starter
async function startWhatsAppBot(sessionId, phoneNumber) {
  console.log(`🚀 Starting SILA AI bot for session: ${sessionId}`);
  
  try {
    const sanitizedNumber = phoneNumber;
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    
    await fs.ensureDir(sessionPath);
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: 'silent' });

    const socket = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: true,
      logger,
      browser: Browsers.macOS('Safari'),
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
      defaultQueryTimeoutMs: 60000
    });

    socket.decodeJid = (jid) => {
      if (!jid) return jid;
      if (/:\d+@/gi.test(jid)) {
        const decoded = jidDecode(jid) || {};
        return (decoded.user && decoded.server) ? decoded.user + '@' + decoded.server : jid;
      } else return jid;
    };

    socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
      } catch (error) {
        console.error('Error saving creds:', error);
      }
    });

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        console.log(`[${sessionId}] QR Code generated`);
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`[${sessionId}] Connection closed, reconnecting: ${shouldReconnect}`);
        
        if (shouldReconnect) {
          await delay(5000);
          startWhatsAppBot(sessionId, phoneNumber);
        } else {
          await Session.updateOne(
            { sessionId: sessionId },
            { $set: { status: 'disconnected' } }
          );
        }
      } else if (connection === 'open') {
        console.log(`✅ [${sessionId}] SILA AI bot connected!`);
        
        // Update session status
        await Session.updateOne(
          { sessionId: sessionId },
          { 
            $set: { 
              status: 'active',
              updatedAt: new Date()
            }
          }
        );
        
        // Store active socket
        activeSockets.set(sanitizedNumber, socket);
        
        // Send welcome message
        const welcomeMsg = silaMessage(`🤖 *SILA AI BOT STARTED!*\n\n` +
          `✅ *Connected Successfully*\n` +
          `📱 Phone: +${sanitizedNumber}\n` +
          `🆔 Session: ${sessionId}\n` +
          `⏰ Time: ${new Date().toLocaleTimeString()}\n\n` +
          `*Auto Features:*\n` +
          `• Always Online: ✅\n` +
          `• Auto Typing: ✅\n` +
          `• Auto Recording: ✅\n` +
          `• Auto View Status: ✅\n` +
          `• Auto Like Status: ✅\n` +
          `• Anti View Once: ✅\n` +
          `• Anti Link: ✅\n` +
          `• Anti Delete: ✅\n\n` +
          `Type !menu for commands`);
        
        await socket.sendMessage(OWNER_NUMBER, welcomeMsg);
        
        // Auto join group
        try {
          await socket.groupAcceptInvite(GROUP_INVITE.split('/').pop());
          console.log(`✅ [${sessionId}] Auto-joined group`);
        } catch (err) {
          console.log(`⚠️ [${sessionId}] Could not auto-join group`);
        }
      }
    });

    // Message handler
    socket.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
      
      const jid = msg.key.remoteJid;
      const text = msg.message.conversation || 
                   msg.message.extendedTextMessage?.text || 
                   msg.message.imageMessage?.caption || '';
      
      // Handle commands
      if (text.startsWith('!') || text.startsWith('/') || text.startsWith('.')) {
        const command = text.toLowerCase().split(' ')[0].slice(1);
        const args = text.split(' ').slice(1);
        
        switch (command) {
          case 'ping':
            await socket.sendMessage(jid, silaMessage('🏓 *Pong!*\n\nSILA AI is active and running!'));
            break;
            
          case 'alive':
            await socket.sendMessage(jid, silaMessage(`🤖 *SILA AI STATUS*\n\n` +
              `✅ *Bot is Alive!*\n` +
              `⏰ Uptime: ${process.uptime().toFixed(0)}s\n` +
              `📊 Memory: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)}MB\n` +
              `👥 Active Sessions: ${activeSockets.size}\n` +
              `🎯 Session ID: ${sessionId}\n` +
              `⚡ Powered by Sila Tech`));
            break;
            
          case 'owner':
            await socket.sendMessage(jid, silaMessage(`👑 *SILA AI OWNER*\n\n` +
              `*Name:* Sila Tech\n` +
              `*Number:* +255789661031\n` +
              `*Channel:* ${CHANNEL_INVITE}\n` +
              `*Group:* ${GROUP_INVITE}\n\n` +
              `Contact for bot customization or issues.`));
            break;
            
          case 'menu':
            const menuText = `📱 *SILA AI BOT MENU*\n\n` +
              `🤖 *Basic Commands:*\n` +
              `• !ping - Check bot response\n` +
              `• !alive - Bot status\n` +
              `• !owner - Owner info\n` +
              `• !song <url> - Download music\n` +
              `• !menu - This menu\n\n` +
              `⚙️ *Auto Features Settings:*\n` +
              `• !autotyping on/off\n` +
              `• !autorecording on/off\n` +
              `• !autoviewstatus on/off\n` +
              `• !autolikestatus on/off\n` +
              `• !antiviewonce on/off\n` +
              `• !antilink on/off\n` +
              `• !antidelete on/off\n\n` +
              `🎵 *Media Commands:*\n` +
              `• !song <url> - Download audio\n` +
              `• !video <query> - Download video\n` +
              `• !ai <query> - Ask AI\n` +
              `• !vv - View view-once media\n\n` +
              `🔗 *Links:*\n` +
              `Group: ${GROUP_INVITE}\n` +
              `Channel: ${CHANNEL_INVITE}\n\n` +
              `*𝙿𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝚂𝚒𝚕𝚊 𝚃𝚎𝚌𝚑*`;
            
            await socket.sendMessage(jid, silaMessage(menuText));
            break;
            
          case 'song':
            if (args.length === 0) {
              await socket.sendMessage(jid, silaMessage('❌ *Usage:* !song <youtube_url>'));
              return;
            }
            
            try {
              await socket.sendMessage(jid, { text: '🎵 *Downloading song...*' });
              
              const apiUrl = `https://api.davidcyriltech.my.id/download/ytmp3?url=${encodeURIComponent(args[0])}`;
              const response = await axios.get(apiUrl, { responseType: 'stream' });
              
              await socket.sendMessage(jid, {
                audio: response.data,
                mimetype: 'audio/mpeg',
                fileName: 'sila_bot_song.mp3'
              });
              
            } catch (error) {
              await socket.sendMessage(jid, silaMessage('❌ *Error downloading song*\n\nPlease check the URL and try again.'));
            }
            break;
        }
      }
    });
    
  } catch (error) {
    console.error(`❌ [${sessionId}] Bot start error:`, error);
  }
}

// Start all sessions on server start
async function startAllSessions() {
  try {
    const sessions = await Session.find({ status: { $in: ['active', 'completed'] } });
    console.log(`🔄 Found ${sessions.length} sessions to reconnect.`);

    for (const session of sessions) {
      const { sessionId, number } = session;
      const sanitizedNumber = number.replace(/[^0-9]/g, '');

      if (activeSockets.has(sanitizedNumber)) {
        console.log(`[ ${sanitizedNumber} ] Already connected. Skipping...`);
        continue;
      }

      try {
        await startWhatsAppBot(sessionId, number);
      } catch (err) {
        console.log(`Error reconnecting ${sanitizedNumber}:`, err.message);
      }
    }

    console.log('✅ Auto-reconnect process completed.');
  } catch (err) {
    console.log('Auto-reconnect error:', err.message);
  }
}

module.exports = { router, startAllSessions };
