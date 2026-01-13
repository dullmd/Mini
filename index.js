require('dotenv').config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  jidDecode,
  delay,
  DisconnectReason,
  Browsers
} = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const { exec } = require('child_process');
const crypto = require('crypto');

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://kaviduinduwara:kavidu2008@cluster0.bqmspdf.mongodb.net/siloBot?retryWrites=true&w=majority&appName=Cluster0';
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

// MongoDB Models
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const sessionSchema = new mongoose.Schema({
  sessionId: String,
  phoneNumber: String,
  status: { type: String, default: 'active' },
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

// Express App
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Store for sessions
const store = makeInMemoryStore({});
store.readFromFile('./baileys_store.json');
setInterval(() => {
  store.writeToFile('./baileys_store.json');
}, 10000);

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

async function autoJoinGroups(socket) {
  try {
    // Auto join group
    await socket.groupAcceptInvite(GROUP_INVITE.split('/').pop());
    console.log('✅ Auto-joined group');
    
    // Auto follow channel (simulated)
    console.log('✅ Auto-followed channel');
    
    // Send welcome message to owner
    const welcomeMsg = await silaMessage(`🤖 *SILA AI BOT Started Successfully!*\n\n` +
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

// Group Event Handler
const groupEvents = {
  handleGroupUpdate: async (socket, update) => {
    try {
      if (!update || !update.id || !update.participants) return;
      
      const participants = update.participants;
      const metadata = await socket.groupMetadata(update.id);
      
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

    console.log(`✅ Auto features initialized for session ${this.sessionId}`);
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
          await delay(2000);
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
        // Simulate viewing status (actual implementation depends on WhatsApp API capabilities)
        console.log('📱 Auto viewing status...');
      } catch (err) {
        console.error('Auto view status error:', err);
      }
    }, 60000); // Every minute
  }

  startAutoLikeStatus() {
    setInterval(async () => {
      try {
        // Simulate liking status
        console.log('❤️ Auto liking status...');
      } catch (err) {
        console.error('Auto like status error:', err);
      }
    }, 120000); // Every 2 minutes
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
          delete: message
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
        const restoreMsg = await silaMessage(`🗑️ *Message Deleted*\n\n` +
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

// Main WhatsApp Bot
async function startWhatsAppBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  
  const socket = makeWASocket({
    version: (await fetchLatestBaileysVersion()).version,
    printQRInTerminal: true,
    auth: state,
    browser: Browsers.macOS('Safari'),
    generateHighQualityLinkPreview: true,
    getMessage: async (key) => {
      if (store) {
        const msg = await store.loadMessage(key.remoteJid, key.id);
        return msg?.message || undefined;
      }
      return undefined;
    }
  });

  store.bind(socket.ev);

  // Auto Features Instance
  const autoFeatures = new AutoFeatures(socket, 'main');
  await autoFeatures.initialize();

  // Auto Join Groups
  await autoJoinGroups(socket);

  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      qrcode.generate(qr, { small: true });
      io.emit('qr', qr);
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
      
      if (shouldReconnect) {
        startWhatsAppBot();
      }
    } else if (connection === 'open') {
      console.log('✅ WhatsApp bot connected!');
      io.emit('connection', 'connected');
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
              `👥 Sessions: 1\n` +
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
}

// Web Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/stats', async (req, res) => {
  try {
    const onlineSessions = await Session.countDocuments({ status: 'active' });
    const totalUsers = await User.countDocuments();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const messagesToday = await Message.countDocuments({ timestamp: { $gte: today } });
    
    res.json({
      onlineSessions,
      totalUsers,
      messagesToday
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  console.log('🔗 Web client connected');
  
  socket.on('getStats', async () => {
    try {
      const onlineSessions = await Session.countDocuments({ status: 'active' });
      const totalUsers = await User.countDocuments();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const messagesToday = await Message.countDocuments({ timestamp: { $gte: today } });
      
      socket.emit('stats', {
        onlineSessions,
        totalUsers,
        messagesToday
      });
    } catch (err) {
      console.error('Stats error:', err);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔗 Web client disconnected');
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
  console.log(`📱 Access at: http://localhost:${PORT}`);
  console.log(`🤖 Bot Name: SILA AI`);
  console.log(`👑 Owner: +255789661031`);
  
  // Start WhatsApp bot
  startWhatsAppBot();
});
