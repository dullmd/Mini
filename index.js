const express = require('express');
const app = express();
__path = process.cwd()
const bodyParser = require("body-parser");
const path = require('path');
const PORT = process.env.PORT || 8000;
const { router: code, startAllSessions } = require('./pair.js');

// Bot Configuration
const GROUP_INVITE = 'https://chat.whatsapp.com/IdGNaKt80DEBqirc2ek4ks';
const CHANNEL_INVITE = 'https://whatsapp.com/channel/0029VbBG4gfISTkCpKxyMH02';

require('events').EventEmitter.defaultMaxListeners = 500;

app.use(express.static(__path));

app.get('/', (req, res) => {
    res.sendFile(path.join(__path, 'pair-code.html'));
});

app.use('/code', code);

app.use((req, res, next) => {
    res.status(404).json({
        status: false,
        message: '❌ Unknown Endpoint!'
    });
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.listen(PORT, async () => {
    console.log(`╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮`);
    console.log(`│           🤖 SILA AI BOT v1.0          │`);
    console.log(`├─────────────────────────────────────────┤`);
    console.log(`│ 📡 Server: http://localhost:${PORT}    │`);
    console.log(`│ 👑 Owner: +255789661031                │`);
    console.log(`│ 📊 MongoDB: Connected                  │`);
    console.log(`│ 🔗 Group: ${GROUP_INVITE.split('/').pop()}  │`);
    console.log(`│ 📢 Channel: SILA AI OFFICIAL           │`);
    console.log(`╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`);
    await startAllSessions();
});

module.exports = app;
