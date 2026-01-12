import { useState, useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";

const API = "http://localhost:3000";

export default function App() {
  /* =======================
     STATE
  ======================= */
  const [step, setStep] = useState("login"); // login | signup | main
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  const [voices, setVoices] = useState([]);
  const [myVoices, setMyVoices] = useState([]);
  const [activeTab, setActiveTab] = useState("feed");
  const [replyingTo, setReplyingTo] = useState(null);
  const [likedVoices, setLikedVoices] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isReplyRecording, setIsReplyRecording] = useState(false);

  const [editProfile, setEditProfile] = useState(false);
  const [editCity, setEditCity] = useState("");
  const [editCountry, setEditCountry] = useState("");

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const replyRecorderRef = useRef(null);
  const replyChunksRef = useRef([]);
  const waveSurfers = useRef({}); // feed voices
  const myWaveSurfers = useRef({}); // my voices
  const [visibleReplies, setVisibleReplies] = useState({});


  /* =======================
     AUTH FUNCTIONS
  ======================= */
  async function signup() {
    const res = await fetch(`${API}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, city, country }),
    });
    const data = await res.json();
    if (res.ok) {
      setToken(data.token);
      setUser(data.user);
      setStep("main");
    } else alert(data.error);
  }

  async function login() {
    const res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.ok) {
      setToken(data.token);
      setUser(data.user);
      setStep("main");
    } else alert(data.error);
  }

  /* =======================
     LOAD DATA
  ======================= */
  async function loadVoices() {
    if (!token) return;
    const res = await fetch(`${API}/api/voices`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setVoices(await res.json());
  }

  async function loadMyVoices() {
    if (!token) return;
    const res = await fetch(`${API}/api/my-voices`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setMyVoices(await res.json());
  }

  useEffect(() => {
    if (!token) return;
    loadVoices();
    loadMyVoices();
    const interval = setInterval(loadVoices, 5000);
    return () => clearInterval(interval);
  }, [token]);

  /* =======================
     RECORDING FUNCTIONS
  ======================= */
  async function toggleRecording() {
    if (isRecording) {
      recorderRef.current.stop();
      setIsRecording(false);
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorderRef.current = new MediaRecorder(stream);
    chunksRef.current = [];
    recorderRef.current.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    recorderRef.current.onstop = uploadVoice;
    recorderRef.current.start();
    setIsRecording(true);
  }

  function toggleReplies(id) {
  setVisibleReplies(prev => ({ ...prev, [id]: !prev[id] }));
}


  async function uploadVoice() {
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    const fd = new FormData();
    fd.append("audio", blob);

    await fetch(`${API}/api/voice`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });

    loadVoices();
    loadMyVoices();
  }

  /* =======================
     REPLY FUNCTIONS
  ======================= */
  async function startReply(id) {
    setReplyingTo(id);
    setIsReplyRecording(true);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    replyRecorderRef.current = new MediaRecorder(stream);
    replyChunksRef.current = [];

    replyRecorderRef.current.ondataavailable = (e) => {
      if (e.data.size) replyChunksRef.current.push(e.data);
    };

    replyRecorderRef.current.start();
  }

  async function stopReply() {
    replyRecorderRef.current.stop();
    setIsReplyRecording(false);

    replyRecorderRef.current.onstop = async () => {
      const blob = new Blob(replyChunksRef.current, { type: "audio/webm" });
      const fd = new FormData();
      fd.append("audio", blob);

      await fetch(`${API}/api/voice/${replyingTo}/reply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      setReplyingTo(null);
      loadVoices();
      loadMyVoices();
    };
  }

  /* =======================
     LIKE FUNCTION
  ======================= */
  async function likeVoice(id) {
    const isLiked = likedVoices.includes(id);

    const res = await fetch(`${API}/api/voice/${id}/like`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ like: !isLiked }),
    });

    const data = await res.json();

    setVoices((v) =>
      v.map((x) => (x.id === id ? { ...x, likes: data.likes } : x))
    );

    setLikedVoices((v) => (isLiked ? v.filter((i) => i !== id) : [...v, id]));
  }

  /* =======================
     DELETE VOICE
  ======================= */
  async function deleteVoice(id) {
    if (!confirm("Delete this voice?")) return;
    await fetch(`${API}/api/voice/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    loadVoices();
    loadMyVoices();
  }

  /* =======================
     WAVEFORM FUNCTIONS
  ======================= */
  function initWaveform(id, url, isMine = false) {
    const refObj = isMine ? myWaveSurfers.current : waveSurfers.current;

    if (refObj[id]) {
      refObj[id].destroy();
    }

    const container = document.getElementById(`waveform-${id}`);
    if (!container) return;

    const ws = WaveSurfer.create({
      container,
      waveColor: "#ddd",
      progressColor: "#0095f6",
      height: 64,
      barWidth: 2,
    });

    ws.load(`${API}${url}`);
    refObj[id] = ws;
  }

  function togglePlay(id, isMine = false) {
    const refObj = isMine ? myWaveSurfers.current : waveSurfers.current;
    if (refObj[id]) refObj[id].playPause();
  }

  /* =======================
     PROFILE IMAGE UPLOAD
  ======================= */
  async function uploadProfile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("profilePic", file);

    const res = await fetch(`${API}/api/auth/profile-pic`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = await res.json();
    if (res.ok) setUser((u) => ({ ...u, profilePic: data.filename }));
    else alert(data.error);
  }

  /* =======================
     PROFILE INFO UPDATE
  ======================= */
  async function saveProfileChanges() {
    const res = await fetch(`${API}/api/auth/update`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ city: editCity, country: editCountry }),
    });
    const data = await res.json();
    if (res.ok) {
      setUser(data.user);
      setEditProfile(false);
    } else alert(data.error);
  }

  /* =======================
     AUTH SCREENS
  ======================= */
  if (step === "login") {
    return (
      <div className="auth-container">
        <h1>VoiceApp</h1>
        <input placeholder="Email" onChange={(e) => setEmail(e.target.value)} />
        <input
          type="password"
          placeholder="Password"
          onChange={(e) => setPassword(e.target.value)}
        />
        <button onClick={login}>Login</button>
        <p>
          or <span onClick={() => setStep("signup")}>Signup</span>
        </p>
      </div>
    );
  }

  if (step === "signup") {
    return (
      <div className="auth-container">
        <h1>Create Account</h1>
        <input placeholder="Email" onChange={(e) => setEmail(e.target.value)} />
        <input
          type="password"
          placeholder="Password"
          onChange={(e) => setPassword(e.target.value)}
        />
        <input placeholder="City" onChange={(e) => setCity(e.target.value)} />
        <input placeholder="Country" onChange={(e) => setCountry(e.target.value)} />
        <button onClick={signup}>Signup</button>
        <p onClick={() => setStep("login")}>Back to login</p>
      </div>
    );
  }

  /* =======================
     MAIN APP
  ======================= */
  return (
    <div className="app-container">
      {/* HEADER */}
      <div className="app-header">
        <div className="logo">🎙️ VoiceApp</div>
      </div>

      {/* CONTENT */}
      <div className="content">
        {/* FEED */}
        {activeTab === "feed" &&
  voices.map((v) => (
    <div key={v.id} className="voice-card-box">
      <div className="voice-card">
        <div className="voice-meta">
          {v.user?.profilePic ? (
            <img src={`${API}/audio/${v.user.profilePic}`} className="pfp" />
          ) : (
            <div className="pfp-placeholder">👤</div>
          )}
          <span>
            {v.user?.city}, {v.user?.country} | ID: {v.user?.id}
          </span>
        </div>

        <div
          id={`waveform-${v.id}`}
          className="waveform"
          ref={() => initWaveform(v.id, v.audioUrl)}
        />
        <button className="play-btn" onClick={() => togglePlay(v.id)}>
          ▶️ Play/Pause
        </button>

        <div className="voice-actions">
          <button
            style={{
              color: likedVoices.includes(v.id) ? "#ff3b3b" : "#262626",
            }}
            onClick={() => likeVoice(v.id)}
          >
            ❤️ {v.likes}
          </button>

          <button
            className={replyingTo === v.id ? "active-reply" : ""}
            onClick={() =>
              replyingTo === v.id ? stopReply() : startReply(v.id)
            }
          >
            {replyingTo === v.id ? "Send Reply" : "Reply"}
          </button>

          <button onClick={() => toggleReplies(v.id)}>
            {visibleReplies[v.id] ? "Hide Replies" : `Show Replies (${v.replies.length})`}
          </button>
        </div>

        {visibleReplies[v.id] &&
          v.replies.map((r) => (
            <div key={r.id} className="reply-card">
              <audio controls src={`${API}${r.audioUrl}`} />
            </div>
          ))}
      </div>
    </div>
  ))}


        {/* PROFILE */}
        {activeTab === "profile" && user && (
  <div className="profile-tab">
    <div className="profile-header">
      {/* Profile Picture */}
      {user.profilePic ? (
        <img src={`${API}/audio/${user.profilePic}`} className="pfp-large" />
      ) : (
        <div className="pfp-placeholder">👤</div>
      )}

      {/* User Info */}
      <h2>{user.email}</h2>
      <p><b>User ID:</b> {user.id}</p>
      <p><b>City:</b> {user.city}</p>
      <p><b>Country:</b> {user.country}</p>

      {/* Profile Picture Upload */}
      <label className="upload-label">
        Upload Profile Image
        <input type="file" onChange={uploadProfile} />
      </label>

      {/* Edit City/Country */}
      <button onClick={() => {
        setEditProfile(!editProfile);
        setEditCity(user.city);
        setEditCountry(user.country);
      }}>
        {editProfile ? "Cancel" : "Edit Info"}
      </button>

      {editProfile && (
        <div className="edit-profile">
          <input
            placeholder="City"
            value={editCity}
            onChange={(e) => setEditCity(e.target.value)}
          />
          <input
            placeholder="Country"
            value={editCountry}
            onChange={(e) => setEditCountry(e.target.value)}
          />
          <button onClick={saveProfileChanges}>Save</button>
        </div>
      )}
    </div>

    {/* My Voices */}
    <div className="my-voices">
      <h3>My Voices</h3>
      {myVoices.length === 0 && <p>No recordings yet.</p>}
      {myVoices.map((v) => (
        <div key={v.id} className="voice-card">
          <div
            id={`waveform-${v.id}-my`}
            className="waveform"
            ref={() => initWaveform(v.id + "-my", v.audioUrl, true)}
          />
          <button className="play-btn" onClick={() => togglePlay(v.id + "-my", true)}>
            ▶️ Play/Pause
          </button>

          <div className="voice-actions">
            <button
              style={{
                color: likedVoices.includes(v.id) ? "#ff3b3b" : "#262626",
              }}
              onClick={() => likeVoice(v.id)}
            >
              ❤️ {v.likes}
            </button>
            <button className="delete-btn" onClick={() => deleteVoice(v.id)}>
              🗑 Delete
            </button>
          </div>

          {v.replies.map((r) => (
            <div key={r.id} className="reply-card">
              <audio controls src={`${API}${r.audioUrl}`} />
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
)}

      </div>

      {/* BOTTOM NAV */}
      <div className="bottom-nav">
        <button onClick={() => setActiveTab("feed")}>Feed</button>
        <button className="record-btn" onClick={toggleRecording}>
          {isRecording ? "Stop" : "Record"}
        </button>
        <button onClick={() => setActiveTab("profile")}>Profile</button>
      </div>

      {/* CSS */}
      <style>{`
        body {margin:0;font-family:Inter,sans-serif;background:#fafafa;}
        .app-container{width:100%;min-height:100vh;padding-bottom:150px;}
        .app-header{position:sticky;top:0;background:#fff;border-bottom:1px solid #dbdbdb;padding:14px;text-align:center;z-index:10;}
        .logo{font-weight:700;font-size:20px;}
        .voice-card{background:#fff; #dbdbdb;padding:2px 4px;margin-bottom:0px;}
        .voice-meta{display:flex;align-items:center;margin-bottom:10px;gap:8px;}
        .pfp{width:36px;height:36px;border-radius:50%;}
        .pfp-large{width:80px;height:80px;border-radius:50%;margin-bottom:10px;}
        .pfp-placeholder{width:40px;height:40px;background:#bbb;display:flex;align-items:center;justify-content:center;border-radius:50%;margin-bottom:10px;}
        .waveform{width:100%;margin-bottom:5px;}
        .voice-actions{display:flex;gap:12px;margin-top:6px;}
        .reply-card{margin-left:52px;margin-top:6px;}
        .bottom-nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);max-width:600px;width:100%;background:#fff;border-top:1px solid #dbdbdb;display:flex;justify-content:space-around;padding:14px 0;}
        .record-btn{position:absolute;top:-32px;left:50%;transform:translateX(-50%);width:64px;height:64px;border-radius:50%;background:#0095f6;color:#fff;border:none;}
        .auth-container{max-width:400px;margin:80px auto;background:#fff;padding:30px;border-radius:12px;text-align:center;}
        .profile-tab{padding:16px;}
        .profile-header{text-align:center;margin-bottom:20px;}
        .upload-label{display:block;margin-top:10px;cursor:pointer;}
        input[type="file"]{display:none;}
        .edit-profile input{display:block;margin:6px auto;padding:8px;width:70%;}
        .play-btn{margin-top:6px;}
        .delete-btn{color:red;}
        .active-reply{color:green;}
        .voice-card-box {
  border: 1px solid #ccc;
  border-radius: 12px;
  margin: 5px;
  background: #fff;
  padding: 12px;
}

      `}</style>
    </div>
  );
}
