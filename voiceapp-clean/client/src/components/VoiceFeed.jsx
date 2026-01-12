import { useEffect, useState } from "react";

export default function VoiceFeed() {
  const [voices, setVoices] = useState([]);

  const loadVoices = async () => {
    const res = await fetch("http://localhost:3000/api/voices");
    const data = await res.json();
    setVoices(data);
  };

  useEffect(() => {
    loadVoices();
  }, []);

  return (
    <div>
      {voices.map(v => (
        <div key={v.id} style={{ marginBottom: 20 }}>
          <div>
            Voice from {v.city}, {v.country}
          </div>
          <audio controls src={`http://localhost:3000${v.audioUrl}`} />
        </div>
      ))}
    </div>
  );
}
