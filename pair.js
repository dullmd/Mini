require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://kaviduinduwara:kavidu2008@cluster0.bqmspdf.mongodb.net/siloBot?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ Pairing server connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Session Schema
const pairingSessionSchema = new mongoose.Schema({
  phoneNumber: String,
  codes: [String],
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now, expires: 600 } // 10 minutes TTL
});

const PairingSession = mongoose.model('PairingSession', pairingSessionSchema);

// Generate 8-digit codes
function generatePairingCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomInt(10000000, 99999999).toString());
  }
  return codes;
}

// Pairing endpoint
app.post('/pair', async (req, res) => {
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
    
    // Save to database
    const session = new PairingSession({
      phoneNumber: phone,
      codes: codes,
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
      phone: phone,
      codes: codes,
      message: linkingMessage,
      timestamp: new Date().toISOString()
    });
    
    console.log(`📱 Pairing codes generated for: ${phone}`);
    
  } catch (error) {
    console.error('Pairing error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate pairing codes'
    });
  }
});

// Verify code endpoint
app.post('/verify', async (req, res) => {
  try {
    const { phone, code } = req.body;
    
    const session = await PairingSession.findOne({
      phoneNumber: phone,
      codes: code,
      status: 'pending'
    });
    
    if (session) {
      // Mark code as used
      session.codes = session.codes.filter(c => c !== code);
      if (session.codes.length === 0) {
        session.status = 'completed';
      }
      await session.save();
      
      res.json({
        success: true,
        verified: true,
        remainingCodes: session.codes.length
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
app.get('/session/:phone', async (req, res) => {
  try {
    const session = await PairingSession.findOne({
      phoneNumber: req.params.phone
    });
    
    if (session) {
      res.json({
        success: true,
        phone: session.phoneNumber,
        status: session.status,
        codesRemaining: session.codes.length,
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

const PORT = process.env.PAIR_PORT || 3001;
app.listen(PORT, () => {
  console.log(`🔗 Pairing server running on port ${PORT}`);
  console.log(`📞 Endpoint: http://localhost:${PORT}/pair`);
});
