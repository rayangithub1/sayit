require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'sayit_secret';

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

/* ===== IN-MEMORY STORE ===== */
const users = {}; // { email: {id,email,password,city,country,profilePic} }
const voices = []; // {id,userId,file,city,country,createdAt,replies:[],likes:0,likedBy:[]}

/* ===== AUTH MIDDLEWARE ===== */
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

/* ===== SIGNUP ===== */
app.post('/api/auth/signup', (req, res) => {
  const { email, password, city, country } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email & password required' });

  if (users[email]) return res.status(400).json({ error: 'User already exists' });

  const userId = uuidv4();
  users[email] = {
    id: userId,
    email,
    password,
    city: city || 'Unknown',
    country: country || 'Unknown',
    profilePic: null
  };

  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });

  res.json({
    token,
    user: {
      id: userId,
      email,
      city: users[email].city,
      country: users[email].country,
      profilePic: null
    }
  });
});

/* ===== LOGIN ===== */
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = users[email];
  if (!user || user.password !== password) return res.status(400).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      city: user.city,
      country: user.country,
      profilePic: user.profilePic
    }
  });
});

/* ===== PROFILE UPDATE ===== */
app.put('/api/auth/update', auth, (req, res) => {
  const { city, country } = req.body;
  const user = Object.values(users).find(u => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.city = city || user.city;
  user.country = country || user.country;

  res.json({ user });
});

/* ===== PROFILE PIC UPLOAD ===== */
app.post('/api/user/profile-pic', auth, upload.single('profilePic'), (req, res) => {
  const user = Object.values(users).find(u => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.profilePic = req.file.filename;
  res.json({ profilePic: user.profilePic });
});

/* ===== VOICE UPLOAD ===== */
app.post('/api/voice', auth, upload.single('audio'), (req, res) => {
  const user = Object.values(users).find(u => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  voices.push({
    id: uuidv4(),
    userId: user.id,
    file: req.file.filename,
    city: user.city,
    country: user.country,
    createdAt: Date.now(),
    replies: [],
    likes: 0,
    likedBy: []
  });

  res.json({ success: true });
});

/* ===== VOICE REPLY ===== */
app.post('/api/voice/:id/reply', auth, upload.single('audio'), (req, res) => {
  const voice = voices.find(v => v.id === req.params.id);
  if (!voice) return res.status(404).json({ error: 'Voice not found' });

  voice.replies.push({
    id: uuidv4(),
    userId: req.user.userId,
    file: req.file.filename,
    createdAt: Date.now()
  });

  res.json({ success: true });
});

/* ===== LIKE VOICE ===== */
app.post('/api/voice/:id/like', auth, (req, res) => {
  const voice = voices.find(v => v.id === req.params.id);
  if (!voice) return res.status(404).json({ error: 'Voice not found' });

  const userId = req.user.userId;
  const { like } = req.body;

  if (!voice.likedBy) voice.likedBy = [];

  if (like) {
    if (!voice.likedBy.includes(userId)) voice.likedBy.push(userId);
  } else {
    voice.likedBy = voice.likedBy.filter(id => id !== userId);
  }

  voice.likes = voice.likedBy.length;

  res.json({ likes: voice.likes, likedByUser: voice.likedBy.includes(userId) });
});

/* ===== GET ALL VOICES ===== */
app.get('/api/voices', auth, (req, res) => {
  const response = voices.map(v => {
    const user = Object.values(users).find(u => u.id === v.userId);

    return {
      ...v,
      audioUrl: `/audio/${v.file}`,
      user: {
        id: user?.id,
        email: user?.email,
        city: user?.city || "Unknown",
        country: user?.country || "Unknown",
        profilePic: user?.profilePic || null
      },
      replies: v.replies.map(r => {
        const replyUser = Object.values(users).find(u => u.id === r.userId);
        return {
          id: r.id,
          audioUrl: `/audio/${r.file}`,
          createdAt: r.createdAt,
          user: {
            id: replyUser?.id,
            email: replyUser?.email,
            city: replyUser?.city || "Unknown",
            country: replyUser?.country || "Unknown",
            profilePic: replyUser?.profilePic || null
          }
        };
      }),
      likedByUser: v.likedBy.includes(req.user.userId)
    };
  }).reverse();

  res.json(response);
});

/* ===== GET MY VOICES ===== */
app.get('/api/my-voices', auth, (req, res) => {
  const myVoices = voices.filter(v => v.userId === req.user.userId);
  res.json(
    myVoices.map(v => ({
      id: v.id,
      audioUrl: `/audio/${v.file}`,
      likes: v.likes,
      replies: v.replies.map(r => ({
        id: r.id,
        audioUrl: `/audio/${r.file}`,
        createdAt: r.createdAt,
        user: Object.values(users).find(u => u.id === r.userId)
      }))
    })).reverse()
  );
});

/* ===== DELETE VOICE ===== */
app.delete('/api/voice/:id', auth, (req, res) => {
  const index = voices.findIndex(v => v.id === req.params.id && v.userId === req.user.userId);
  if (index === -1) return res.status(404).json({ error: 'Voice not found or not yours' });

  voices.splice(index, 1);
  res.json({ success: true });
});

/* ===== STATIC AUDIO ===== */
app.use('/audio', express.static(uploadDir));

/* ===== START SERVER ===== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
