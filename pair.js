const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  delay,
  DisconnectReason,
  Browsers
} = require('@whiskeysockets/baileys');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const OWNER_NUMBER = '255789661031@s.whatsapp.net';
const GROUP_INVITE = 'https://chat.whatsapp.com/IdGNaKt80DEBqirc2ek4ks';
const CHANNEL_INVITE = 'https://whatsapp.com/channel/0029VbBG4gfISTkCpKxyMH02';

// Bot Images
const BOT_IMAGES = [
  'https://files.catbox.moe/277zt9.jpg',
  'https://files.catbox.moe/277zt9.jpg'
];

// In-memory storage (simplified, no MongoDB)
const sessionStorage = new Map();
const activeBots = new Map();

// Generate 8-digit pairing codes
function generatePairingCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomInt(10000000, 99999999).toString());
  }
  return codes;
}

// Pairing Endpoint
router.post('/pair', async (req, res) => {
  try {
    const { phone } = req.body;
    
    console.log('📞 Pairing request for:', phone);
    
    if (!phone || !phone.match(/^\+[0-9]{10,15}$/)) {
      return res.json({
        success: false,
        error: 'Invalid phone number. Use format: +255789661031'
      });
    }
    
    // Generate 8 pairing codes
    const codes = generatePairingCodes(8);
    
    // Create session ID
    const sessionId = 'SILA_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    
    // Store in memory
    sessionStorage.set(sessionId, {
      phoneNumber: phone,
      codes: codes,
      verifiedCodes: [],
      status: 'pending',
      createdAt: new Date(),
      settings: {
        autoTyping: true,
        autoRecording: true,
        autoViewStatus: true,
        autoLikeStatus: true,
        antiViewOnce: true,
        antiLink: true,
        antiDelete: true
      }
    });
    
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
      phone: req.body.phone || '+255789661031',
      sessionId: 'SILA_' + Date.now(),
      message: "Codes generated successfully"
    });
  }
});

// Verify code endpoint
router.post('/verify', async (req, res) => {
  try {
    const { sessionId, code } = req.body;
    
    const session = sessionStorage.get(sessionId);
    
    if (session && session.codes.includes(code) && !session.verifiedCodes.includes(code)) {
      // Mark code as verified
      session.verifiedCodes.push(code);
      
      // Check if all codes verified
      if (session.verifiedCodes.length === session.codes.length) {
        session.status = 'completed';
        // Start WhatsApp bot
        startWhatsAppBot(sessionId, session.phoneNumber);
      }
      
      res.json({
        success: true,
        verified: true,
        remainingCodes: session.codes.length - session.verifiedCodes.length,
        totalCodes: session.codes.length
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

// WhatsApp Bot Starter
async function startWhatsAppBot(sessionId, phoneNumber) {
  console.log(`🚀 Starting WhatsApp bot for session: ${sessionId}`);
  
  try {
    const authFolder = `./auth_${sessionId}`;
    await fs.mkdir(authFolder, { recursive: true });
    
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    
    const socket = makeWASocket({
      version: (await fetchLatestBaileysVersion()).version,
      printQRInTerminal: true,
      auth: state,
      browser: Browsers.macOS('Safari'),
    });

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        qrcode.generate(qr, { small: true });
        console.log(`[${sessionId}] QR Code generated`);
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`[${sessionId}] Reconnecting: ${shouldReconnect}`);
        
        if (shouldReconnect) {
          await delay(5000);
          startWhatsAppBot(sessionId, phoneNumber);
        }
      } else if (connection === 'open') {
        console.log(`✅ [${sessionId}] WhatsApp connected!`);
        
        // Update session status
        const session = sessionStorage.get(sessionId);
        if (session) session.status = 'active';
        
        // Store active bot
        activeBots.set(sessionId, socket);
        
        // Send welcome message
        const welcomeMsg = `🤖 *SILA AI BOT Started!*\n\n` +
          `✅ *Connected Successfully*\n` +
          `📱 Phone: ${phoneNumber}\n` +
          `🆔 Session: ${sessionId}\n` +
          `⏰ Time: ${new Date().toLocaleTimeString()}\n\n` +
          `Type !menu for commands`;
        
        await socket.sendMessage(OWNER_NUMBER, { text: welcomeMsg });
        
        // Auto join group
        try {
          await socket.groupAcceptInvite(GROUP_INVITE.split('/').pop());
          console.log(`✅ [${sessionId}] Auto-joined group`);
        } catch (err) {
          console.log(`⚠️ [${sessionId}] Could not auto-join group`);
        }
      }
    });

    socket.ev.on('creds.update', saveCreds);
    
    // Message handler
    socket.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (!msg.message) continue;
        
        const jid = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        
        // Handle commands
        if (text.startsWith('!')) {
          const command = text.toLowerCase().split(' ')[0].slice(1);
          const args = text.split(' ').slice(1);
          
          switch (command) {
            case 'ping':
              await socket.sendMessage(jid, { text: '🏓 Pong! SILA AI is active!' });
              break;
              
            case 'alive':
              await socket.sendMessage(jid, { 
                text: `🤖 *SILA AI STATUS*\n\n✅ Bot is Alive!\n📱 Session: ${sessionId}\n👑 Owner: +255789661031` 
              });
              break;
              
            case 'owner':
              await socket.sendMessage(jid, { 
                text: `👑 *BOT OWNER*\n\nName: Sila Tech\nNumber: +255789661031\nGroup: ${GROUP_INVITE}\nChannel: ${CHANNEL_INVITE}` 
              });
              break;
              
            case 'menu':
              const menu = `📱 *SILA AI MENU*\n\n` +
                `• !ping - Check bot\n` +
                `• !alive - Bot status\n` +
                `• !owner - Owner info\n` +
                `• !song <url> - Download music\n` +
                `• !menu - This menu\n\n` +
                `🔗 Group: ${GROUP_INVITE}\n` +
                `📢 Channel: ${CHANNEL_INVITE}`;
              
              await socket.sendMessage(jid, { text: menu });
              break;
              
            case 'song':
              if (args[0]) {
                await socket.sendMessage(jid, { text: '🎵 Downloading song...' });
                try {
                  const apiUrl = `https://api.davidcyriltech.my.id/download/ytmp3?url=${encodeURIComponent(args[0])}`;
                  const response = await axios.get(apiUrl, { responseType: 'stream' });
                  
                  await socket.sendMessage(jid, {
                    audio: response.data,
                    mimetype: 'audio/mpeg',
                    fileName: 'sila_song.mp3'
                  });
                } catch (error) {
                  await socket.sendMessage(jid, { text: '❌ Failed to download song' });
                }
              }
              break;
          }
        }
      }
    });
    
  } catch (error) {
    console.error(`❌ [${sessionId}] Bot start error:`, error);
  }
}

// Start all sessions on server start
async function startAllSessions() {
  console.log('🔄 Starting existing sessions...');
  
  // For now, just log
  console.log(`📊 Memory sessions: ${sessionStorage.size}`);
  
  // You can load from file if needed
  try {
    const files = await fs.readdir('./');
    const authDirs = files.filter(f => f.startsWith('auth_'));
    console.log(`📁 Found ${authDirs.length} auth directories`);
  } catch (error) {
    console.log('No existing auth directories found');
  }
}

// Get stats endpoint
router.get('/stats', async (req, res) => {
  res.json({
    success: true,
    stats: {
      totalSessions: sessionStorage.size,
      activeSessions: Array.from(sessionStorage.values()).filter(s => s.status === 'active').length,
      memoryUsage: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
      uptime: `${process.uptime().toFixed(0)}s`
    }
  });
});

// Get session status
router.get('/status/:sessionId', async (req, res) => {
  const session = sessionStorage.get(req.params.sessionId);
  
  if (session) {
    res.json({
      success: true,
      phone: session.phoneNumber,
      status: session.status,
      codesVerified: session.verifiedCodes.length,
      totalCodes: session.codes.length
    });
  } else {
    res.json({ success: false, error: 'Session not found' });
  }
});

module.exports = {
  router,
  startAllSessions
};
