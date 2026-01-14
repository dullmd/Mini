const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const os = require('os');
const axios = require('axios');
const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, DisconnectReason, jidDecode, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const yts = require('yt-search');
const googleTTS = require("google-tts-api");
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
  console.log('⚠️ Running with in-memory storage...');
});

// MongoDB Schemas
const sessionSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  sessionId: { type: String },
  pairingCodes: { type: [String], default: [] },
  verifiedCodes: { type: [String], default: [] },
  settings: { type: Object, default: {} },
  creds: { type: Object },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  status: { type: String, default: 'pending' }
});

const settingsSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  settings: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// MongoDB Models
const Session = mongoose.model('Session', sessionSchema);
const Settings = mongoose.model('Settings', settingsSchema);

console.log('✅ SILA AI Bot initialized with MongoDB');

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';

if (!fs.existsSync(SESSION_BASE_PATH)) {
  fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

// Create plugins directory
const PLUGINS_PATH = './plugins';
if (!fs.existsSync(PLUGINS_PATH)) {
  fs.mkdirSync(PLUGINS_PATH, { recursive: true });
}

// Bot Configuration
const OWNER_NUMBER = '255789661031@s.whatsapp.net';
const CHANNEL_JIDS = ['120363402325089913@newsletter'];
const GROUP_INVITE = 'https://chat.whatsapp.com/IdGNaKt80DEBqirc2ek4ks';
const CHANNEL_INVITE = 'https://whatsapp.com/channel/0029VbBG4gfISTkCpKxyMH02';

// Bot Images
const BOT_IMAGES = [
  'https://files.catbox.moe/277zt9.jpg',
  'https://files.catbox.moe/277zt9.jpg',
  'https://files.catbox.moe/277zt9.jpg'
];

// Define combined fakevCard with SILA AI version
const fakevCard = {
  key: {
    fromMe: false,
    participant: "0@s.whatsapp.net",
    remoteJid: "status@broadcast"
  },
  message: {
    contactMessage: {
      displayName: "© SILA AI 🤖",
      vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:SILA AI\nORG:SILA AI;\nTEL;type=CELL;type=VOICE;waid=255789661031:+255789661031\nEND:VCARD`
    }
  }
};

// Utility function for formatted messages
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

// Default Settings
const defaultSettings = {
  autoread: true,
  online: true,
  autoswview: true,
  autoswlike: true,
  autorecording: true,
  autotyping: true,
  autoviewstatus: true,
  autolikestatus: true,
  antiviewonce: true,
  antilink: true,
  antidelete: true,
  welcome: true,
  goodbye: true,
  promote: true,
  demote: true
};

// MongoDB CRUD operations for Session model
Session.findOneAndUpdate = async function(query, update, options = {}) {
  try {
    const session = await this.findOne(query);
    
    if (session) {
      if (update.$set) {
        Object.assign(session, update.$set);
      } else {
        Object.assign(session, update);
      }
      session.updatedAt = new Date();
      await session.save();
      return session;
    } else if (options.upsert) {
      const newSession = new this({
        ...query,
        ...update.$set,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await newSession.save();
      return newSession;
    }
    return null;
  } catch (error) {
    console.error('Error in findOneAndUpdate:', error);
    return null;
  }
};

// MongoDB CRUD operations for Settings model
Settings.findOneAndUpdate = async function(query, update, options = {}) {
  try {
    const settings = await this.findOne(query);
    
    if (settings) {
      if (update.$set) {
        Object.assign(settings.settings, update.$set);
      } else {
        Object.assign(settings.settings, update);
      }
      settings.updatedAt = new Date();
      await settings.save();
      return settings;
    } else if (options.upsert) {
      const newSettings = new this({
        ...query,
        settings: update.$set || update,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await newSettings.save();
      return newSettings;
    }
    return null;
  } catch (error) {
    console.error('Error in Settings findOneAndUpdate:', error);
    return null;
  }
};

// Helper function to get settings
async function getSettings(number) {
  try {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    let settingsDoc = await Settings.findOne({ number: sanitizedNumber });

    if (!settingsDoc) {
      settingsDoc = await Settings.findOneAndUpdate(
        { number: sanitizedNumber },
        { $set: defaultSettings },
        { upsert: true, new: true }
      );
      return defaultSettings;
    }

    const mergedSettings = { ...defaultSettings };
    for (let key in settingsDoc.settings) {
      if (typeof settingsDoc.settings[key] === 'object' && !Array.isArray(settingsDoc.settings[key]) && settingsDoc.settings[key] !== null) {
        mergedSettings[key] = {
          ...defaultSettings[key],
          ...settingsDoc.settings[key]
        };
      } else {
        mergedSettings[key] = settingsDoc.settings[key];
      }
    }

    return mergedSettings;
  } catch (error) {
    console.error('Error in getSettings:', error);
    return defaultSettings;
  }
}

// Helper function to update settings
async function updateSettings(number, updates = {}) {
  try {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    let settingsDoc = await Settings.findOne({ number: sanitizedNumber });

    if (!settingsDoc) {
      settingsDoc = await Settings.findOneAndUpdate(
        { number: sanitizedNumber },
        { $set: { ...defaultSettings, ...updates } },
        { upsert: true, new: true }
      );
      return settingsDoc.settings;
    }

    const mergedSettings = { ...defaultSettings };
    
    for (const key in settingsDoc.settings) {
      if (typeof settingsDoc.settings[key] === 'object' && !Array.isArray(settingsDoc.settings[key]) && settingsDoc.settings[key] !== null) {
        mergedSettings[key] = {
          ...defaultSettings[key],
          ...settingsDoc.settings[key],
        };
      } else {
        mergedSettings[key] = settingsDoc.settings[key];
      }
    }

    for (const key in updates) {
      if (typeof updates[key] === 'object' && !Array.isArray(updates[key]) && updates[key] !== null) {
        mergedSettings[key] = {
          ...mergedSettings[key],
          ...updates[key],
        };
      } else {
        mergedSettings[key] = updates[key];
      }
    }

    settingsDoc.settings = mergedSettings;
    settingsDoc.updatedAt = new Date();
    await settingsDoc.save();

    return mergedSettings;
  } catch (error) {
    console.error('Error in updateSettings:', error);
    return defaultSettings;
  }
}

// Helper function to save settings
async function saveSettings(number) {
  try {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    let settingsDoc = await Settings.findOne({ number: sanitizedNumber });

    if (!settingsDoc) {
      settingsDoc = new Settings({
        number: sanitizedNumber,
        settings: defaultSettings
      });
      await settingsDoc.save();
      return defaultSettings;
    }

    const settings = settingsDoc.settings;
    let updated = false;

    for (const key in defaultSettings) {
      if (!(key in settings)) {
        settings[key] = defaultSettings[key];
        updated = true;
      } else if (typeof defaultSettings[key] === 'object' && defaultSettings[key] !== null && !Array.isArray(defaultSettings[key])) {
        for (const subKey in defaultSettings[key]) {
          if (!(subKey in settings[key])) {
            settings[key][subKey] = defaultSettings[key][subKey];
            updated = true;
          }
        }
      }
    }

    if (updated) {
      settingsDoc.settings = settings;
      settingsDoc.updatedAt = new Date();
      await settingsDoc.save();
    }

    return settings;
  } catch (error) {
    console.error('Error in saveSettings:', error);
    return defaultSettings;
  }
}

// Helper functions
function getQuotedText(quotedMessage) {
  if (!quotedMessage) return '';

  if (quotedMessage.conversation) return quotedMessage.conversation;
  if (quotedMessage.extendedTextMessage?.text) return quotedMessage.extendedTextMessage.text;
  if (quotedMessage.imageMessage?.caption) return quotedMessage.imageMessage.caption;
  if (quotedMessage.videoMessage?.caption) return quotedMessage.videoMessage.caption;
  if (quotedMessage.buttonsMessage?.contentText) return quotedMessage.buttonsMessage.contentText;
  if (quotedMessage.listMessage?.description) return quotedMessage.listMessage.description;
  if (quotedMessage.listMessage?.title) return quotedMessage.listMessage.title;
  if (quotedMessage.listResponseMessage?.singleSelectReply?.selectedRowId) return quotedMessage.listResponseMessage.singleSelectReply.selectedRowId;
  if (quotedMessage.templateButtonReplyMessage?.selectedId) return quotedMessage.templateButtonReplyMessage.selectedId;
  if (quotedMessage.reactionMessage?.text) return quotedMessage.reactionMessage.text;

  if (quotedMessage.viewOnceMessage) {
    const inner = quotedMessage.viewOnceMessage.message;
    if (inner?.imageMessage?.caption) return inner.imageMessage.caption;
    if (inner?.videoMessage?.caption) return inner.videoMessage.caption;
    if (inner?.imageMessage) return '[view once image]';
    if (inner?.videoMessage) return '[view once video]';
  }

  if (quotedMessage.stickerMessage) return '[sticker]';
  if (quotedMessage.audioMessage) return '[audio]';
  if (quotedMessage.documentMessage?.fileName) return quotedMessage.documentMessage.fileName;
  if (quotedMessage.contactMessage?.displayName) return quotedMessage.contactMessage.displayName;

  return '';
}

// Delay function
function myDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Generate 8-digit pairing codes
function generatePairingCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push(Math.floor(10000000 + Math.random() * 90000000).toString());
  }
  return codes;
}

// Auto Features Implementation
class AutoFeatures {
  constructor(socket, sessionId) {
    this.socket = socket;
    this.sessionId = sessionId;
    this.settings = {
      autoTyping: true,
      autoRecording: true,
      autoViewStatus: true,
      autoLikeStatus: true,
      antiViewOnce: true,
      antiLink: true,
      antiDelete: true
    };
    this.typingIntervals = new Map();
    this.recordingIntervals = new Map();
  }

  async initialize(settings) {
    this.settings = { ...this.settings, ...settings };
    
    // Auto view status stories
    if (this.settings.autoViewStatus) {
      this.startAutoViewStatus();
    }

    // Auto like status
    if (this.settings.autoLikeStatus) {
      this.startAutoLikeStatus();
    }

    console.log(`✅ [${this.sessionId}] Auto features initialized`);
  }

  async startAutoTyping(jid) {
    if (!this.settings.autoTyping) return;
    
    if (!this.typingIntervals.has(jid)) {
      const interval = setInterval(async () => {
        try {
          await this.socket.sendPresenceUpdate('composing', jid);
          await myDelay(3000);
          await this.socket.sendPresenceUpdate('paused', jid);
        } catch (err) {
          console.error(`[${this.sessionId}] Auto typing error:`, err);
          this.stopAutoTyping(jid);
        }
      }, 10000);
      
      this.typingIntervals.set(jid, interval);
    }
  }

  stopAutoTyping(jid) {
    if (this.typingIntervals.has(jid)) {
      clearInterval(this.typingIntervals.get(jid));
      this.typingIntervals.delete(jid);
    }
  }

  async startAutoRecording(jid) {
    if (!this.settings.autoRecording) return;
    
    if (!this.recordingIntervals.has(jid)) {
      const interval = setInterval(async () => {
        try {
          await this.socket.sendPresenceUpdate('recording', jid);
          await myDelay(2000);
          await this.socket.sendPresenceUpdate('paused', jid);
        } catch (err) {
          console.error(`[${this.sessionId}] Auto recording error:`, err);
          this.stopAutoRecording(jid);
        }
      }, 15000);
      
      this.recordingIntervals.set(jid, interval);
    }
  }

  stopAutoRecording(jid) {
    if (this.recordingIntervals.has(jid)) {
      clearInterval(this.recordingIntervals.get(jid));
      this.recordingIntervals.delete(jid);
    }
  }

  startAutoViewStatus() {
    setInterval(async () => {
      try {
        console.log(`[${this.sessionId}] 📱 Auto viewing status...`);
      } catch (err) {
        console.error(`[${this.sessionId}] Auto view status error:`, err);
      }
    }, 60000);
  }

  startAutoLikeStatus() {
    setInterval(async () => {
      try {
        console.log(`[${this.sessionId}] ❤️ Auto liking status...`);
      } catch (err) {
        console.error(`[${this.sessionId}] Auto like status error:`, err);
      }
    }, 120000);
  }

  async handleAntiLink(message, jid) {
    if (!this.settings.antiLink) return false;
    
    const linkRegex = /https?:\/\/[^\s]+/g;
    const links = message.match(linkRegex);
    
    if (links && !links.some(link => 
      link.includes('whatsapp.com') || 
      link.includes('chat.whatsapp.com') ||
      link.includes(CHANNEL_INVITE) ||
      link.includes(GROUP_INVITE)
    )) {
      try {
        await this.socket.sendMessage(jid, {
          text: '⚠️ *Links are not allowed in this group!*\n\nYour message has been deleted.',
        });
        return true;
      } catch (err) {
        console.error(`[${this.sessionId}] Anti-link error:`, err);
      }
    }
    return false;
  }

  async updateSetting(setting, value) {
    this.settings[setting] = value;
    
    // Start/stop features based on setting
    switch (setting) {
      case 'autoTyping':
        if (!value) {
          for (const jid of this.typingIntervals.keys()) {
            this.stopAutoTyping(jid);
          }
        }
        break;
      case 'autoRecording':
        if (!value) {
          for (const jid of this.recordingIntervals.keys()) {
            this.stopAutoRecording(jid);
          }
        }
        break;
    }

    return true;
  }
}

// Group Event Handler
const groupEvents = {
  handleGroupUpdate: async (socket, update, sessionId) => {
    try {
      if (!update || !update.id || !update.participants) return;
      
      const participants = update.participants;
      
      for (const num of participants) {
        const userName = num.split("@")[0];
        
        if (update.action === "add") {
          const welcomeText = `╭━━【 𝐖𝐄𝐋𝐂𝐎𝐌𝐄 】━━━━━━━━╮\n` +
                             `│ 👋 @${userName}\n` +
                             `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                             `*𝙿𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝚂𝚒𝚕𝚊 𝚃𝚎𝚌𝚑*`;
          
          await socket.sendMessage(update.id, {
            text: welcomeText,
            mentions: [num]
          });
          
        } else if (update.action === "remove") {
          const goodbyeText = `╭━━【 𝐆𝐎𝐎𝐃𝐁𝐘𝐄 】━━━━━━━━╮\n` +
                             `│ 👋 @${userName}\n` +
                             `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                             `*𝙿𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝚂𝚒𝚕𝚊 𝚃𝚎𝚌𝚑*`;
          
          await socket.sendMessage(update.id, {
            text: goodbyeText,
            mentions: [num]
          });
        }
      }
    } catch (err) {
      console.error(`[${sessionId}] Group event error:`, err);
    }
  }
};

// Pairing Endpoints
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
    const sessionId = 'SILA_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    
    // Save to database
    try {
      await Session.findOneAndUpdate(
        { number: phone.replace('+', '') },
        { 
          sessionId: sessionId,
          pairingCodes: codes,
          verifiedCodes: [],
          status: 'pending',
          settings: defaultSettings,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );
    } catch (dbError) {
      console.log('⚠️ MongoDB save failed, using in-memory:', dbError.message);
    }
    
    res.json({
      success: true,
      sessionId: sessionId,
      phone: phone,
      codes: codes,
      message: `✅ 8 Pairing codes generated for ${phone}`,
      timestamp: new Date().toISOString()
    });
    
    console.log(`✅ Codes generated for ${phone}: ${codes.join(', ')}`);
    
  } catch (error) {
    console.error('Pairing error:', error);
    res.json({
      success: true,
      codes: generatePairingCodes(8),
      phone: req.body.phone || '255789661031',
      sessionId: 'SILA_' + Date.now(),
      message: "Codes generated successfully"
    });
  }
});

// Verify code endpoint
router.post('/verify', async (req, res) => {
  try {
    const { sessionId, code } = req.body;
    
    const session = await Session.findOne({ sessionId: sessionId });
    
    if (session && session.pairingCodes.includes(code) && !session.verifiedCodes.includes(code)) {
      // Mark code as verified
      session.verifiedCodes.push(code);
      
      // Check if all codes verified
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
    const sanitizedNumber = phoneNumber.replace(/[^0-9]/g, '');
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

    // Initialize auto features
    const session = await Session.findOne({ sessionId: sessionId });
    const settings = session ? session.settings : defaultSettings;
    const autoFeatures = new AutoFeatures(socket, sessionId);
    await autoFeatures.initialize(settings);

    socket.decodeJid = (jid) => {
      if (!jid) return jid;
      if (/:\d+@/gi.test(jid)) {
        const decoded = jidDecode(jid) || {};
        return (decoded.user && decoded.server) ? decoded.user + '@' + decoded.server : jid;
      } else return jid;
    };

    socketCreationTime.set(sanitizedNumber, Date.now());

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
          await myDelay(5000);
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
      const sender = msg.key.participant || msg.key.remoteJid;
      const text = msg.message.conversation || 
                   msg.message.extendedTextMessage?.text || 
                   msg.message.imageMessage?.caption || '';
      
      // Auto typing
      if (settings.autotyping) {
        autoFeatures.startAutoTyping(jid);
      }

      // Auto recording
      if (settings.autorecording) {
        autoFeatures.startAutoRecording(jid);
      }

      // Anti-link
      if (settings.antilink) {
        await autoFeatures.handleAntiLink(text, jid);
      }

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
              `🎯 Current Session: ${sessionId}\n` +
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
            
          case 'video':
          case 'ytmp4':
          case 'mp4':
          case 'ytv':
            try {
              const query = args.join(" ");
              if (!query) {
                return await socket.sendMessage(jid, silaMessage('❌ *Usage:* !video <search query>'));
              }

              const search = await yts(query);
              if (!search.videos.length) {
                return await socket.sendMessage(jid, silaMessage('❌ No videos found!'));
              }

              const data = search.videos[0];
              const ytUrl = data.url;

              const api = `https://gtech-api-xtp1.onrender.com/api/video/yt?apikey=APIKEY&url=${encodeURIComponent(ytUrl)}`;
              const { data: apiRes } = await axios.get(api);

              if (!apiRes?.status || !apiRes.result?.media?.video_url) {
                return await socket.sendMessage(jid, silaMessage('❌ Failed to download video!'));
              }

              const result = apiRes.result.media;
              const caption = `*🎬 SILA AI Video Download*\n\n` +
                `*Title:* ${data.title}\n` +
                `*Duration:* ${data.timestamp}\n` +
                `*Views:* ${data.views}\n` +
                `*Channel:* ${data.author.name}\n\n` +
                `*Link:* ${data.url}`;

              await socket.sendMessage(jid, { 
                video: { url: result.video_url }, 
                caption: caption,
                mimetype: "video/mp4" 
              });
              
            } catch (error) {
              await socket.sendMessage(jid, silaMessage('❌ Error downloading video!'));
            }
            break;
            
          case 'ai':
          case 'bot':
          case 'gpt':
            try {
              if (!args.length) {
                return await socket.sendMessage(jid, silaMessage('❌ *Usage:* !ai <your question>'));
              }

              const q = args.join(" ");
              const apiUrl = `https://lance-frank-asta.onrender.com/api/gpt?q=${encodeURIComponent(q)}`;
              const { data } = await axios.get(apiUrl);

              if (!data || !data.message) {
                return await socket.sendMessage(jid, silaMessage('❌ AI failed to respond!'));
              }

              await socket.sendMessage(jid, silaMessage(`🤖 *SILA AI Response:*\n\n${data.message}`));
            } catch (error) {
              await socket.sendMessage(jid, silaMessage('❌ Error connecting to AI!'));
            }
            break;
            
          case 'vv':
          case 'antivv':
          case 'avv':
          case 'viewonce':
          case 'open':
            try {
              const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
              if (!quoted) {
                return await socket.sendMessage(jid, silaMessage('❌ Reply to a view-once message!'));
              }

              let type = Object.keys(quoted)[0];
              if (!["imageMessage", "videoMessage", "audioMessage"].includes(type)) {
                return await socket.sendMessage(jid, silaMessage('❌ Only view-once media can be opened!'));
              }

              const stream = await downloadContentFromMessage(quoted[type], type.replace("Message", ""));
              let buffer = Buffer.from([]);
              for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

              if (type === "imageMessage") {
                await socket.sendMessage(jid, {
                  image: buffer,
                  caption: quoted[type]?.caption || "",
                  mimetype: quoted[type]?.mimetype || "image/jpeg"
                });
              } else if (type === "videoMessage") {
                await socket.sendMessage(jid, {
                  video: buffer,
                  caption: quoted[type]?.caption || "",
                  mimetype: quoted[type]?.mimetype || "video/mp4"
                });
              } else if (type === "audioMessage") {
                await socket.sendMessage(jid, {
                  audio: buffer,
                  mimetype: quoted[type]?.mimetype || "audio/mp4",
                  ptt: quoted[type]?.ptt || false
                });
              }
            } catch (error) {
              await socket.sendMessage(jid, silaMessage('❌ Failed to open view-once media!'));
            }
            break;
            
          // Auto features settings
          case 'autotyping':
          case 'autorecording':
          case 'autoviewstatus':
          case 'autolikestatus':
          case 'antiviewonce':
          case 'antilink':
          case 'antidelete':
            if (args.length === 0 || !['on', 'off'].includes(args[0])) {
              await socket.sendMessage(jid, silaMessage(`❌ *Usage:* !${command} on/off`));
              return;
            }
            
            const value = args[0] === 'on';
            const settingName = command;
            
            // Update settings in database
            await Session.updateOne(
              { sessionId: sessionId },
              { $set: { [`settings.${settingName}`]: value } }
            );
            
            // Update in auto features
            await autoFeatures.updateSetting(settingName, value);
            
            await socket.sendMessage(jid, silaMessage(`✅ *${command.toUpperCase()} ${value ? 'ENABLED' : 'DISABLED'}*\n\n` +
              `Feature has been turned ${value ? 'ON' : 'OFF'}.`));
            break;
            
          case 'repo':
            await socket.sendMessage(jid, silaMessage(`📦 *SILA AI Repository*\n\n` +
              `*GitHub:* Coming soon...\n` +
              `*Bot URL:* https://sila-free-bot.onrender.com\n\n` +
              `*Join our channels for updates!*`));
            break;
        }
      }
    });

    // Handle group updates
    socket.ev.on('group-participants.update', async (update) => {
      await groupEvents.handleGroupUpdate(socket, update, sessionId);
    });

    // Status handler
    socket.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (!msg || !msg.message) return;

      const sender = msg.key.remoteJid;
      const isStatus = sender === 'status@broadcast';
      
      if (isStatus) {
        if (settings.autoswview) {
          try {
            await socket.readMessages([msg.key]);
          } catch (e) {}
        }

        if (settings.autoswlike) {
          try {
            const emojis = ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            await socket.sendMessage(msg.key.remoteJid, { 
              react: { 
                key: msg.key, 
                text: randomEmoji 
              } 
            });
          } catch (e) {}
        }
      }

      if (!isStatus && settings.autoread) {
        await socket.readMessages([msg.key]);
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
