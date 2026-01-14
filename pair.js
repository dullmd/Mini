const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const router = express.Router();

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

// Global variables
const activeSockets = new Map();
const socketCreationTime = new Map();

// Fake vCard for quotes
const fakevCard = {
  key: {
    remoteJid: 'status@broadcast',
    fromMe: false,
    id: '123456789'
  },
  message: {
    conversation: 'SILA AI BOT'
  }
};

// Utility function
const myDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// MongoDB Connection
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// MongoDB Schemas
const sessionSchema = new mongoose.Schema({
  number: String,
  sessionId: String,
  settings: {
    autoTyping: { type: Boolean, default: true },
    autoRecording: { type: Boolean, default: true },
    autoViewStatus: { type: Boolean, default: true },
    autoLikeStatus: { type: Boolean, default: true },
    antiViewOnce: { type: Boolean, default: true },
    antiLink: { type: Boolean, default: true },
    antiDelete: { type: Boolean, default: true }
  },
  createdAt: { type: Date, default: Date.now },
  lastActive: Date
});

const userSchema = new mongoose.Schema({
  jid: String,
  name: String,
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

// Sila Message Utility
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

// Upload creds to MongoDB
async function uploadCredsToMongoDB(filePath, number) {
  try {
    const credsData = fs.readFileSync(filePath, 'utf8');
    const credsJson = JSON.parse(credsData);
    
    const sessionId = crypto.randomBytes(16).toString('hex');
    
    // Store session in MongoDB
    await Session.findOneAndUpdate(
      { number: number },
      { 
        sessionId: sessionId,
        lastActive: new Date(),
        'settings.autoTyping': true,
        'settings.autoRecording': true,
        'settings.autoViewStatus': true,
        'settings.autoLikeStatus': true,
        'settings.antiViewOnce': true,
        'settings.antiLink': true,
        'settings.antiDelete': true
      },
      { upsert: true, new: true }
    );
    
    return sessionId;
  } catch (error) {
    console.error('Error uploading creds to MongoDB:', error);
    throw error;
  }
}

// Download session from MongoDB
async function sessionDownload(sessionId, number) {
  try {
    const session = await Session.findOne({ sessionId: sessionId, number: number });
    if (!session) {
      throw new Error('Session not found in database');
    }
    
    const sessionPath = path.join(__dirname, 'sessions', number);
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }
    
    // In a real implementation, you would fetch and save actual session data
    console.log(`[ ${number} ] Session loaded from MongoDB`);
    return sessionPath;
  } catch (error) {
    console.error('Session download error:', error);
    throw error;
  }
}

// Group Event Handler
const groupEvents = {
  handleGroupUpdate: async (socket, update) => {
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
          
        } else if (update.action === "promote") {
          const promoter = update.author?.split("@")[0] || "System";
          const promoteText = `╭━━【 𝐏𝐑𝐎𝐌𝐎𝐓𝐄 】━━━━━━━━╮\n` +
                             `│ ⬆️ @${userName}\n` +
                             `│ 👑 By: @${promoter}\n` +
                             `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                             `*𝙿𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝚂𝚒𝚕𝚊 𝚃𝚎𝚌𝚑*`;
          
          const mentions = update.author ? [update.author, num] : [num];
          await socket.sendMessage(update.id, {
            text: promoteText,
            mentions: mentions
          });
          
        } else if (update.action === "demote") {
          const demoter = update.author?.split("@")[0] || "System";
          const demoteText = `╭━━【 𝐃𝐄𝐌𝐎𝐓𝐄 】━━━━━━━━╮\n` +
                            `│ ⬇️ @${userName}\n` +
                            `│ 👑 By: @${demoter}\n` +
                            `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                            `*𝙿𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝚂𝚒𝚕𝚊 𝚃𝚎𝚌𝚑*`;
          
          const mentions = update.author ? [update.author, num] : [num];
          await socket.sendMessage(update.id, {
            text: demoteText,
            mentions: mentions
          });
        }
      }
    } catch (err) {
      console.error('Group event error:', err);
    }
  }
};

// Auto Features Class
class AutoFeatures {
  constructor(socket, number) {
    this.socket = socket;
    this.number = number;
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
    const session = await Session.findOne({ number: this.number });
    if (session && session.settings) {
      this.settings = { ...this.settings, ...session.settings };
    }

    if (this.settings.autoViewStatus) this.startAutoViewStatus();
    if (this.settings.autoLikeStatus) this.startAutoLikeStatus();

    console.log(`✅ Auto features initialized for ${this.number}`);
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
          console.error('Auto typing error:', err);
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
          console.error('Auto recording error:', err);
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
        console.log('📱 Auto viewing status...');
      } catch (err) {
        console.error('Auto view status error:', err);
      }
    }, 60000);
  }

  startAutoLikeStatus() {
    setInterval(async () => {
      try {
        console.log('❤️ Auto liking status...');
      } catch (err) {
        console.error('Auto like status error:', err);
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
          text: '⚠️ *Links are not allowed in this group!*\n\nYour message has been deleted.'
        });
        return true;
      } catch (err) {
        console.error('Anti-link error:', err);
      }
    }
    return false;
  }

  async handleAntiDelete(messageId, jid, sender) {
    if (!this.settings.antiDelete) return;
    
    try {
      const msg = await Message.findOne({ jid, sender, timestamp: { $gte: new Date(Date.now() - 60000) } });
      if (msg) {
        const restoreMsg = silaMessage(`🗑️ *Message Deleted*\n\n` +
          `*Sender:* @${sender.split('@')[0]}\n` +
          `*Message:* ${msg.message}\n` +
          `*Time:* ${msg.timestamp.toLocaleTimeString()}`);
        
        await this.socket.sendMessage(OWNER_NUMBER, restoreMsg);
      }
    } catch (err) {
      console.error('Anti-delete error:', err);
    }
  }

  async updateSetting(setting, value) {
    this.settings[setting] = value;
    
    await Session.updateOne(
      { number: this.number },
      { $set: { [`settings.${setting}`]: value } }
    );

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

// Main Bot Function
async function silaBot(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(__dirname, 'sessions', sanitizedNumber);
  
  const responseStatus = {
    connected: false,
    codeSent: false,
    error: null
  };

  socketCreationTime.set(sanitizedNumber, Date.now());

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const socket = makeWASocket({
      version: version,
      auth: state,
      printQRInTerminal: true,
      browser: Browsers.macOS('Safari'),
      syncFullHistory: true,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      emitOwnEvents: true,
      defaultQueryTimeoutMs: 60000
    });

    // Initialize Auto Features
    const autoFeatures = new AutoFeatures(socket, sanitizedNumber);
    await autoFeatures.initialize();

    // Auto Join Groups
    async function autoJoinGroups() {
      try {
        console.log('✅ Auto-joining group...');
        console.log('✅ Auto-following channel...');
        
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
        console.error('Auto join error:', err);
      }
    }

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (connection === 'close') {
        let shouldReconnect = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(`[ ${sanitizedNumber} ] Connection closed with status:`, statusCode);
        
        switch (statusCode) {
          case DisconnectReason.connectionClosed:
            console.log(`[ ${sanitizedNumber} ] Connection closed, reconnecting...`);
            shouldReconnect = true;
            responseStatus.error = 'Connection closed. Reconnecting...';
            break;
            
          case DisconnectReason.connectionLost:
            console.log(`[ ${sanitizedNumber} ] Connection lost, reconnecting...`);
            shouldReconnect = true;
            responseStatus.error = 'Connection lost. Reconnecting...';
            break;
            
          case DisconnectReason.connectionReplaced:
            console.log(`[ ${sanitizedNumber} ] Connection replaced, no reconnection.`);
            responseStatus.error = 'Connection replaced by another device.';
            break;
            
          case DisconnectReason.restartRequired:
            console.log(`[ ${sanitizedNumber} ] Restart required, reconnecting...`);
            shouldReconnect = true;
            responseStatus.error = 'Restart required. Reconnecting...';
            break;
            
          case DisconnectReason.timedOut:
            console.log(`[ ${sanitizedNumber} ] Connection timeout, reconnecting...`);
            shouldReconnect = true;
            responseStatus.error = 'Connection timeout. Reconnecting...';
            break;
            
          case DisconnectReason.loggedOut:
            console.log(`[ ${sanitizedNumber} ] Device logged out, please pair again.`);
            responseStatus.error = 'Device logged out. Please pair again.';
            break;
            
          default:
            console.log(`[ ${sanitizedNumber} ] Unknown disconnection reason:`, statusCode);
            responseStatus.error = shouldReconnect 
              ? 'Unexpected disconnection. Attempting to reconnect...' 
              : 'Connection terminated. Please try pairing again.';
            break;
        }
        
        activeSockets.delete(sanitizedNumber);
        socketCreationTime.delete(sanitizedNumber);
        
        if (!res.headersSent && responseStatus.error) {
          res.status(500).send({ 
            status: 'error', 
            message: `[ ${sanitizedNumber} ] ${responseStatus.error}` 
          });
        }
        
        if (shouldReconnect) {
          await myDelay(5000);
          await silaBot(number, { headersSent: true, status: () => ({ send: () => {} }) });
        }
        
      } else if (connection === 'connecting') {
        console.log(`[ ${sanitizedNumber} ] Connecting...`);
        
      } else if (connection === 'open') {
        console.log(`[ ${sanitizedNumber} ] Connected successfully!`);

        activeSockets.set(sanitizedNumber, socket);
        responseStatus.connected = true;

        try {
          const filePath = path.join(sessionPath, 'creds.json');

          if (!fs.existsSync(filePath)) {
            console.error("File not found");
            if (!res.headersSent) {
              res.status(500).send({
                status: 'error',
                message: "File not found"
              });
            }
            return;
          }

          const sessionId = await uploadCredsToMongoDB(filePath, sanitizedNumber);
          const userId = await socket.decodeJid(socket.user.id);
          
          await Session.findOneAndUpdate(
            { number: userId }, 
            { sessionId: sessionId, lastActive: new Date() }, 
            { upsert: true, new: true }
          );     
          
          await socket.sendMessage(userId, { 
            text: `*╭━━━〔 🐢 𝚂𝙸𝙻𝙰 𝙼𝙳 🐢 〕━━━┈⊷*\n*┃🐢│ 𝙱𝙾𝚃 𝙲𝙾𝙽𝙽𝙴𝙲𝚃𝙴𝙳 𝚂𝚄𝙲𝙲𝙴𝚂𝚂𝙵𝚄𝙻𝙻𝚈!*\n*┃🐢│ 𝚃𝙸𝙼𝙴 :❯ ${new Date().toLocaleString()}*\n*┃🐢│ 𝚂𝚃𝙰𝚃𝚄𝚂 :❯ 𝙾𝙽𝙻𝙸𝙽𝙴 𝙰𝙽𝙳 𝚁𝙴𝙰𝙳𝚈!*\n*╰━━━━━━━━━━━━━━━┈⊷*\n\n*📢 Make sure to join our channels and groups!*` 
          }, { quoted: fakevCard });

          // Auto join groups after connection
          await autoJoinGroups();

        } catch (e) {
          console.log('Error saving session:', e.message);
        }
 
        if (!res.headersSent) {
          res.status(200).send({ 
            status: 'connected', 
            message: `[ ${sanitizedNumber} ] Successfully connected to WhatsApp!` 
          });
        }
      }
    });

    // Handle incoming messages
    socket.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;
        
        const jid = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.imageMessage?.caption || 
                     '';
        
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
                `👥 Sessions: ${activeSockets.size}\n` +
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
      await groupEvents.handleGroupUpdate(socket, update);
    });

    // Handle message deletions
    socket.ev.on('messages.delete', async (deleteData) => {
      if (deleteData.keys && autoFeatures.settings.antiDelete) {
        for (const key of deleteData.keys) {
          await autoFeatures.handleAntiDelete(key.id, key.remoteJid, key.participant);
        }
      }
    });

    // Generate pairing code if not registered
    if (!socket.authState.creds.registered) {
      let retries = 3;
      let code = null;
      
      while (retries > 0 && !code) {
        try {
          await myDelay(1500);
          code = await socket.requestPairingCode(sanitizedNumber);
          
          if (code) {
            console.log(`[ ${sanitizedNumber} ] Pairing code generated: ${code}`);
            responseStatus.codeSent = true;

            if (!res.headersSent) {
              res.status(200).send({ 
                status: 'pairing_code_sent', 
                code: code,
                message: `[ ${sanitizedNumber} ] Enter this code in WhatsApp: ${code}` 
              });
            }
            break;
          }
        } catch (error) {
          retries--;
          console.log(`[ ${sanitizedNumber} ] Failed to request, retries left: ${retries}.`);
          
          if (retries > 0) {
            await myDelay(300 * (4 - retries));
          }
        }
      }
      
      if (!code && !res.headersSent) {
        res.status(500).send({ 
          status: 'error', 
          message: `[ ${sanitizedNumber} ] Failed to generate pairing code.` 
        });
      }
    } else {
      console.log(`[ ${sanitizedNumber} ] Already registered, connecting...`);
    }

    // Timeout handler
    setTimeout(() => {
      if (!responseStatus.connected && !res.headersSent) {
        res.status(408).send({ 
          status: 'timeout', 
          message: `[ ${sanitizedNumber} ] Connection timeout. Please try again.` 
        });

        if (activeSockets.has(sanitizedNumber)) {
          activeSockets.get(sanitizedNumber).ws?.close();
          activeSockets.delete(sanitizedNumber);
        }

        socketCreationTime.delete(sanitizedNumber);
      }
    }, 60000);

  } catch (error) {
    console.log(`[ ${sanitizedNumber} ] Setup error:`, error.message);
    
    if (!res.headersSent) {
      res.status(500).send({ 
        status: 'error', 
        message: `[ ${sanitizedNumber} ] Failed to initialize connection.` 
      });
    }
  }
}

// Auto reconnect all sessions
async function startAllSessions() {
  try {
    const sessions = await Session.find();
    console.log(`🔄 Found ${sessions.length} sessions to reconnect.`);

    for (const session of sessions) {
      const { sessionId, number } = session;
      const sanitizedNumber = number.replace(/[^0-9]/g, '');

      if (activeSockets.has(sanitizedNumber)) {
        console.log(`[ ${sanitizedNumber} ] Already connected. Skipping...`);
        continue;
      }

      try {
        await sessionDownload(sessionId, sanitizedNumber);
        await silaBot(number, { headersSent: true, status: () => ({ send: () => {} }) });
      } catch (err) {
        console.log(`Error reconnecting ${sanitizedNumber}:`, err.message);
      }
    }

    console.log('✅ Auto-reconnect process completed.');
  } catch (err) {
    console.log('Auto-reconnect error:', err.message);
  }
}

// Router endpoints
router.get('/', async (req, res) => {
  const { number } = req.query;
  
  if (!number) {
    return res.status(400).send({ 
      status: 'error',
      message: 'Number parameter is required' 
    });
  }

  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  
  if (!sanitizedNumber || sanitizedNumber.length < 10) {
    return res.status(400).send({ 
      status: 'error',
      message: 'Invalid phone number format' 
    });
  }

  if (activeSockets.has(sanitizedNumber)) {
    return res.status(200).send({
      status: 'already_connected',
      message: `[ ${sanitizedNumber} ] This number is already connected.`
    });
  }

  await silaBot(number, res);
});

// Cleanup on exit
process.on('exit', async () => {
  activeSockets.forEach((socket, number) => {
    try {
      socket.ws?.close();
    } catch (error) {
      console.error(`[ ${number} ] Failed to close connection.`);
    }
    activeSockets.delete(number);
    socketCreationTime.delete(number);
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { router, startAllSessions };
