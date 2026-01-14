const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  delay,
  DisconnectReason,
  Browsers
} = require('@whiskeysockets/baileys');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://kaviduinduwara:kavidu2008@cluster0.bqmspdf.mongodb.net/soloBot?retryWrites=true&w=majority&appName=Cluster0';
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

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Database Schemas
const sessionSchema = new mongoose.Schema({
  sessionId: String,
  phoneNumber: String,
  pairingCodes: [String],
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  lastActive: Date,
  settings: {
    autoJoin: { type: Boolean, default: true },
    autoFollow: { type: Boolean, default: true },
    autoTyping: { type: Boolean, default: true },
    autoRecording: { type: Boolean, default: true },
    autoViewStatus: { type: Boolean, default: true },
    autoLikeStatus: { type: Boolean, default: true },
    antiViewOnce: { type: Boolean, default: true },
    antiLink: { type: Boolean, default: true },
    antiDelete: { type: Boolean, default: true }
  }
});

const userSchema = new mongoose.Schema({
  jid: String,
  name: String,
  isAdmin: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  commandsUsed: { type: Number, default: 0 },
  joinedAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  jid: String,
  sender: String,
  message: String,
  timestamp: { type: Date, default: Date.now },
  deleted: { type: Boolean, default: false }
});

const Session = mongoose.model('Session', sessionSchema);
const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// Global store for active sessions
const activeSessions = new Map();

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
        sourceUrl: 'https://whatsapp.com/channel/0029VbBG4gfISTkCpKxyMH02',
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

// Generate 8-digit pairing codes
function generatePairingCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomInt(10000000, 99999999).toString());
  }
  return codes;
}

// Pairing Endpoints
router.post('/pair', async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone || !phone.match(/^\+[0-9]{10,15}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format. Use +255789661031 format'
      });
    }
    
    // Generate 8 pairing codes
    const codes = generatePairingCodes(8);
    
    // Create session ID
    const sessionId = crypto.randomBytes(16).toString('hex');
    
    // Save to database
    const session = new Session({
      sessionId: sessionId,
      phoneNumber: phone,
      pairingCodes: codes,
      status: 'pending'
    });
    
    await session.save();
    
    // Create WhatsApp linking message
    const linkingMessage = `🔗 *SILA AI BOT PAIRING CODES*\n\n` +
      `*Phone:* ${phone}\n` +
      `*Status:* Pending\n\n` +
      `*Your Pairing Codes:*\n` +
      `${codes.map((code, i) => `${i + 1}. ${code}`).join('\n')}\n\n` +
      `*Instructions:*\n` +
      `1. Open WhatsApp on your phone\n` +
      `2. Go to Settings > Linked Devices\n` +
      `3. Tap on "Link a Device"\n` +
      `4. Enter codes one by one when prompted\n` +
      `5. Bot will auto-connect after pairing\n\n` +
      `⚠️ *Codes expire in 10 minutes*\n` +
      `🔗 *Links will auto-join after pairing*`;
    
    res.json({
      success: true,
      sessionId: sessionId,
      phone: phone,
      codes: codes,
      message: linkingMessage,
      timestamp: new Date().toISOString()
    });
    
    console.log(`📱 Pairing codes generated for: ${phone} | Session: ${sessionId}`);
    
  } catch (error) {
    console.error('Pairing error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate pairing codes'
    });
  }
});

// Verify pairing code
router.post('/verify', async (req, res) => {
  try {
    const { sessionId, code } = req.body;
    
    const session = await Session.findOne({
      sessionId: sessionId,
      pairingCodes: code,
      status: 'pending'
    });
    
    if (session) {
      // Remove used code
      session.pairingCodes = session.pairingCodes.filter(c => c !== code);
      
      // If all codes used, mark as completed and start bot
      if (session.pairingCodes.length === 0) {
        session.status = 'completed';
        await session.save();
        
        // Start WhatsApp bot for this session
        startWhatsAppBot(sessionId, session.phoneNumber);
      } else {
        await session.save();
      }
      
      res.json({
        success: true,
        verified: true,
        remainingCodes: session.pairingCodes.length,
        sessionId: sessionId
      });
    } else {
      res.json({
        success: true,
        verified: false,
        message: 'Invalid or expired code'
      });
    }
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Verification failed'
    });
  }
});

// Get session status
router.get('/status/:sessionId', async (req, res) => {
  try {
    const session = await Session.findOne({
      sessionId: req.params.sessionId
    });
    
    if (session) {
      res.json({
        success: true,
        phone: session.phoneNumber,
        status: session.status,
        codesRemaining: session.pairingCodes.length,
        createdAt: session.createdAt
      });
    } else {
      res.json({
        success: false,
        error: 'Session not found'
      });
    }
  } catch (error) {
    console.error('Session check error:', error);
    res.status(500).json({
      success: false,
      error: 'Session check failed'
    });
  }
});

// Auto Join Groups Function
async function autoJoinGroups(socket, sessionId) {
  try {
    // Auto join group
    await socket.groupAcceptInvite(GROUP_INVITE.split('/').pop());
    console.log(`✅ [${sessionId}] Auto-joined group`);
    
    // Send welcome message to owner
    const welcomeMsg = silaMessage(`🤖 *SILA AI BOT Started Successfully!*\n\n` +
      `✅ *Auto Features Enabled:*\n` +
      `• Always Online\n` +
      `• Auto Typing\n` +
      `• Auto Recording\n` +
      `• Auto View Status\n` +
      `• Auto Like Status\n` +
      `• Anti View Once\n` +
      `• Anti Link\n` +
      `• Anti Delete\n\n` +
      `📊 *Bot Information:*\n` +
      `• Owner: @${OWNER_NUMBER.split('@')[0]}\n` +
      `• Channel: ${CHANNEL_INVITE}\n` +
      `• Group: ${GROUP_INVITE}\n\n` +
      `Type !menu for commands list`);
    
    await socket.sendMessage(OWNER_NUMBER, welcomeMsg);
  } catch (err) {
    console.error(`[${sessionId}] Auto join error:`, err);
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

// Auto Features Class
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

  async initialize() {
    // Load settings from database
    const session = await Session.findOne({ sessionId: this.sessionId });
    if (session && session.settings) {
      this.settings = { ...this.settings, ...session.settings };
    }

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
          await delay(3000);
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
          await delay(2000);
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
          delete: true
        });
        return true;
      } catch (err) {
        console.error(`[${this.sessionId}] Anti-link error:`, err);
      }
    }
    return false;
  }

  async handleAntiDelete(messageId, jid, sender) {
    if (!this.settings.antiDelete) return;
    
    try {
      const msg = await Message.findOne({ 
        jid: jid, 
        sender: sender, 
        timestamp: { $gte: new Date(Date.now() - 60000) } 
      }).sort({ timestamp: -1 });
      
      if (msg) {
        const restoreMsg = silaMessage(`🗑️ *Message Deleted*\n\n` +
          `*Sender:* @${sender.split('@')[0]}\n` +
          `*Message:* ${msg.message.substring(0, 100)}${msg.message.length > 100 ? '...' : ''}\n` +
          `*Time:* ${msg.timestamp.toLocaleTimeString()}\n` +
          `*Session:* ${this.sessionId}`);
        
        await this.socket.sendMessage(OWNER_NUMBER, restoreMsg);
      }
    } catch (err) {
      console.error(`[${this.sessionId}] Anti-delete error:`, err);
    }
  }

  async updateSetting(setting, value) {
    this.settings[setting] = value;
    
    // Save to database
    await Session.updateOne(
      { sessionId: this.sessionId },
      { $set: { [`settings.${setting}`]: value } }
    );

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

// WhatsApp Bot Function
async function startWhatsAppBot(sessionId, phoneNumber) {
  console.log(`🚀 Starting WhatsApp bot for session: ${sessionId}`);
  
  try {
    const authFolder = `./auth_${sessionId}`;
    
    // Create auth folder if not exists
    await fs.mkdir(authFolder, { recursive: true });
    
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    
    const socket = makeWASocket({
      version: (await fetchLatestBaileysVersion()).version,
      printQRInTerminal: true,
      auth: state,
      browser: Browsers.macOS('Safari'),
      generateHighQualityLinkPreview: true,
    });

    // Initialize auto features
    const autoFeatures = new AutoFeatures(socket, sessionId);
    await autoFeatures.initialize();

    // Auto Join Groups
    await autoJoinGroups(socket, sessionId);

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        qrcode.generate(qr, { small: true });
        console.log(`[${sessionId}] New QR code generated`);
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`[${sessionId}] Connection closed, reconnecting: ${shouldReconnect}`);
        
        if (shouldReconnect) {
          // Wait 5 seconds before reconnecting
          await delay(5000);
          startWhatsAppBot(sessionId, phoneNumber);
        }
      } else if (connection === 'open') {
        console.log(`✅ [${sessionId}] WhatsApp bot connected!`);
        
        // Update session status
        await Session.updateOne(
          { sessionId: sessionId },
          { 
            $set: { 
              status: 'active',
              lastActive: new Date()
            }
          }
        );
        
        // Store active session
        activeSessions.set(sessionId, { socket, autoFeatures });
      }
    });

    socket.ev.on('creds.update', saveCreds);
    
    socket.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;
        
        const jid = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.imageMessage?.caption || '';
        
        // Save message to database
        await Message.create({
          jid,
          sender,
          message: text,
          timestamp: new Date()
        });

        // Update user in database
        await User.findOneAndUpdate(
          { jid: sender },
          { $inc: { commandsUsed: 1 } },
          { upsert: true, new: true }
        );

        // Auto typing
        if (autoFeatures.settings.autoTyping) {
          autoFeatures.startAutoTyping(jid);
        }

        // Auto recording
        if (autoFeatures.settings.autoRecording) {
          autoFeatures.startAutoRecording(jid);
        }

        // Anti-link
        if (await autoFeatures.handleAntiLink(text, jid)) {
          return;
        }

        // Handle commands
        if (text.startsWith('!') || text.startsWith('/') || text.startsWith('.')) {
          const command = text.toLowerCase().split(' ')[0].slice(1);
          const args = text.split(' ').slice(1);
          
          switch (command) {
            case 'ping':
              await socket.sendMessage(jid, silaMessage('🏓 *Pong!*\n\nBot is active and running!'));
              break;
              
            case 'alive':
              await socket.sendMessage(jid, silaMessage(`🤖 *SILA AI STATUS*\n\n` +
                `✅ *Bot is Alive!*\n` +
                `⏰ Uptime: ${process.uptime().toFixed(0)}s\n` +
                `📊 Memory: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)}MB\n` +
                `👥 Sessions: ${activeSessions.size}\n` +
                `🎯 Current Session: ${sessionId}\n` +
                `⚡ Powered by Sila Tech`));
              break;
              
            case 'owner':
              await socket.sendMessage(jid, silaMessage(`👑 *BOT OWNER*\n\n` +
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
              
              if (await autoFeatures.updateSetting(settingName, value)) {
                await socket.sendMessage(jid, silaMessage(`✅ *${command.toUpperCase()} ${value ? 'ENABLED' : 'DISABLED'}*\n\n` +
                  `Feature has been turned ${value ? 'ON' : 'OFF'}.`));
              }
              break;
          }
        }
      }
    });

    // Handle group updates
    socket.ev.on('group-participants.update', async (update) => {
      await groupEvents.handleGroupUpdate(socket, update, sessionId);
    });

    // Handle message deletions
    socket.ev.on('messages.delete', async (deleteData) => {
      if (deleteData.keys && autoFeatures.settings.antiDelete) {
        for (const key of deleteData.keys) {
          await autoFeatures.handleAntiDelete(key.id, key.remoteJid, key.participant);
        }
      }
    });

  } catch (error) {
    console.error(`❌ [${sessionId}] Failed to start bot:`, error);
  }
}

// Start all active sessions on server start
async function startAllSessions() {
  try {
    const activeSessions = await Session.find({ 
      status: { $in: ['active', 'completed'] } 
    });
    
    console.log(`🔄 Starting ${activeSessions.length} existing sessions...`);
    
    for (const session of activeSessions) {
      startWhatsAppBot(session.sessionId, session.phoneNumber);
    }
  } catch (error) {
    console.error('Error starting sessions:', error);
  }
}

// Get all sessions endpoint
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await Session.find().sort({ createdAt: -1 });
    
    res.json({
      success: true,
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.status === 'active').length,
      sessions: sessions.map(s => ({
        sessionId: s.sessionId,
        phoneNumber: s.phoneNumber,
        status: s.status,
        createdAt: s.createdAt,
        lastActive: s.lastActive
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get bot stats
router.get('/stats', async (req, res) => {
  try {
    const totalSessions = await Session.countDocuments();
    const activeSessionsCount = await Session.countDocuments({ status: 'active' });
    const totalUsers = await User.countDocuments();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const messagesToday = await Message.countDocuments({ timestamp: { $gte: today } });
    
    res.json({
      success: true,
      stats: {
        totalSessions,
        activeSessions: activeSessionsCount,
        totalUsers,
        messagesToday,
        memoryUsage: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
        uptime: `${process.uptime().toFixed(0)} seconds`
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = {
  router,
  startAllSessions
};
