import { useRef, useState } from "react";

export default function VoiceRecorder({ onUploaded }) {
  const mediaRecorder = useRef(null);
  const chunks = useRef([]);
  const [recording, setRecording] = useState(false);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder.current = new MediaRecorder(stream);
    chunks.current = [];

    mediaRecorder.current.ondataavailable = e => {
      if (e.data.size > 0) chunks.current.push(e.data);
    };

    mediaRecorder.current.onstop = async () => {
      const blob = new Blob(chunks.current, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("audio", blob);

      const token = localStorage.getItem("token");

      await fetch("http://localhost:3000/api/voice", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      onUploaded();
    };

    mediaRecorder.current.start();
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorder.current.stop();
    setRecording(false);
  };

  return (
    <button onClick={recording ? stopRecording : startRecording}>
      {recording ? "Stop Recording" : "Record Voice"}
    </button>
  );
}
