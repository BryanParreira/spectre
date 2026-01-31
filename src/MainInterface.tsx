// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { Eye, ArrowUp, Settings, X, Power, Sparkles, MessageSquare, Zap, Activity, AlertCircle, Cloud } from 'lucide-react';
import './index.css';

const MainInterface = () => {
  const [messages, setMessages] = useState([{ id: 1, text: "Spectre online.", sender: 'ai' }]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // LIVE MODE
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  // UPDATES
  const [updateState, setUpdateState] = useState({ status: 'idle' });

  // HARDWARE
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('default');

  // CONFIG
  const [config, setConfig] = useState({
    provider: (localStorage.getItem('provider') || 'ollama'),
    apiKey: localStorage.getItem('apiKey') || '',
    model: localStorage.getItem('model') || 'llama3.2',
    systemContext: localStorage.getItem('systemContext') || ''
  });
  const [ollamaModels, setOllamaModels] = useState([]);

  // REFS
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const isLiveRef = useRef(false);
  const liveIntervalRef = useRef(null);
  const audioIntervalRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);

  // INITIALIZATION
  useEffect(() => {
    if (window.electronAPI?.onUpdateMsg) window.electronAPI.onUpdateMsg((msg) => setUpdateState(msg));
    navigator.mediaDevices.enumerateDevices().then(devices => setAudioDevices(devices.filter(d => d.kind === 'audioinput')));
    if (config.provider === 'ollama') fetchOllamaModels();
    return () => stopEverything();
  }, []);

  const stopEverything = () => {
    isLiveRef.current = false;
    setIsLiveMode(false);
    setVolumeLevel(0);
    
    // Stop Screen Watcher
    if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    
    // Stop Audio Recorder
    if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const toggleLiveMode = () => {
    if (isLiveMode) {
      stopEverything();
      addMessage("Live mode stopped.", 'ai');
    } else {
      if (config.provider === 'ollama') {
        addMessage("⚠️ Live Dictation requires Groq or OpenAI. Please switch providers in Settings.", 'ai');
        setShowSettings(true);
        return;
      }
      isLiveRef.current = true;
      setIsLiveMode(true);
      addMessage("Live Mode Active. Listening (Whisper Engine)...", 'ai');
      
      // 1. Screen Analysis (Every 5s)
      handleCapture(true);
      liveIntervalRef.current = setInterval(() => handleCapture(true), 5000);
      
      // 2. Start Audio Engine
      startWhisperEngine();
    }
  };

  // --- NEW WHISPER ENGINE (UNBREAKABLE) ---
  const startWhisperEngine = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { deviceId: selectedAudioDevice !== 'default' ? { exact: selectedAudioDevice } : undefined } 
      });

      // A. Visualizer
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVol = () => {
        if (!isLiveRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setVolumeLevel(avg);
        requestAnimationFrame(updateVol);
      };
      updateVol();

      // B. Recorder
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        if (!isLiveRef.current || audioChunksRef.current.length === 0) return;
        
        // Convert to Blob
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = []; // Reset
        
        // Transcribe
        if (audioBlob.size > 2000) { // Only send if we actually recorded something
          await transcribeAudio(audioBlob);
        }
        
        // Restart if still live
        if (isLiveRef.current) recorder.start();
      };

      // Loop: Stop & Send every 4 seconds
      recorder.start();
      audioIntervalRef.current = setInterval(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 4000); // 4 Second Chunks

    } catch (e) {
      console.error("Audio Error:", e);
      addMessage("Could not access microphone.", 'ai');
      setIsLiveMode(false);
    }
  };

  const transcribeAudio = async (audioBlob) => {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
      formData.append('model', config.provider === 'groq' ? 'distil-whisper-large-v3-en' : 'whisper-1');

      let url = '';
      let headers = {};

      if (config.provider === 'groq') {
        url = 'https://api.groq.com/openai/v1/audio/transcriptions';
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      } else if (config.provider === 'openai') {
        url = 'https://api.openai.com/v1/audio/transcriptions';
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      } else {
        return; // Ollama doesn't support audio yet
      }

      const res = await fetch(url, { method: 'POST', headers, body: formData });
      const data = await res.json();

      if (data.text && data.text.trim().length > 0) {
        setInput(prev => {
          const spacing = (prev.length > 0 && !prev.endsWith(' ')) ? ' ' : '';
          return prev + spacing + data.text.trim();
        });
      }
    } catch (e) {
      console.error("Transcription Failed:", e);
    }
  };

  // --- API & HELPERS ---
  const fetchOllamaModels = async () => {
    try {
      const res = await fetch('http://localhost:11434/api/tags');
      const data = await res.json();
      setOllamaModels(data.models.map((m) => m.name));
    } catch (e) {}
  };

  const saveSettings = () => {
    localStorage.setItem('provider', config.provider);
    localStorage.setItem('apiKey', config.apiKey);
    localStorage.setItem('model', config.model);
    localStorage.setItem('systemContext', config.systemContext);
    setShowSettings(false);
  };

  const addMessage = (text, sender) => setMessages(p => [...p, { id: Date.now(), text, sender }]);

  const handleSendText = async () => {
    if (!input.trim() || isLoading) return;
    const txt = input; setInput(""); addMessage(txt, "user");
    await callAI(txt, null);
  };

  const handleCapture = async (silent = false) => {
    if (isLoading && !silent) return;
    if (!silent) addMessage("Analyzing screen...", "user");
    try {
      const dataURL = await window.electronAPI.captureScreen();
      const base64 = dataURL.split(',')[1];
      const prompt = input || (silent ? "Briefly list major changes." : "What is on this screen?");
      if (!silent) setInput("");
      await callAI(prompt, base64, silent);
    } catch (e) { if (!silent) addMessage(`Error: ${e.message}`, 'ai'); }
  };

  const callAI = async (prompt, imageBase64, silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const finalPrompt = config.systemContext ? `CONTEXT: ${config.systemContext}\n\nQUESTION: ${prompt}` : prompt;
      let url = '', body = {}, headers = { 'Content-Type': 'application/json' };
      if (config.provider === 'ollama') {
        url = 'http://localhost:11434/api/generate';
        body = { model: config.model, prompt: finalPrompt, stream: false, images: imageBase64 ? [imageBase64] : undefined };
      } else {
        url = config.provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${config.apiKey}`;
        const content = [{ type: "text", text: finalPrompt }];
        if (imageBase64) content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } });
        body = { model: config.model, messages: [{ role: "user", content }] };
      }
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json();
      const reply = config.provider === 'ollama' ? data.response : data.choices[0].message.content;
      if (!silent) addMessage(reply.replace(/\n/g, '<br/>'), 'ai');
      else console.log("Live Update:", reply);
    } catch (e) { if (!silent) addMessage(`Error: ${e.message}`, 'ai'); } 
    finally { if (!silent) setIsLoading(false); }
  };

  return (
    <div className="app-container">
      <div className="header-drag-area"></div>
      <button className="settings-trigger" onClick={() => setShowSettings(true)}><Settings size={20} /></button>

      <div className="chat-area">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.sender}`}><div dangerouslySetInnerHTML={{ __html: msg.text }} /></div>
        ))}
        {isLoading && <div className="message ai">Thinking...</div>}
        <div ref={chatEndRef} />
      </div>

      <div className="input-section">
        <div className="suggestions">
          <button className={`chip ${isLiveMode ? 'active' : ''}`} onClick={toggleLiveMode}>
            {isLiveMode ? <Activity size={12} className="spin" /> : <Zap size={12} />} {isLiveMode ? 'Live On' : 'Start Live Mode'}
          </button>
          <button className="chip" onClick={() => setInput("Summarize meeting notes")}><MessageSquare size={12} /> Notes</button>
          <button className="chip" onClick={() => setInput("Draft a reply")}><Sparkles size={12} /> Reply</button>
        </div>
        <div className="input-wrapper">
          {isLiveMode && <div style={{ position: 'absolute', bottom: 0, left: 0, height: '3px', width: `${Math.min(volumeLevel * 2, 100)}%`, background: '#22c55e', transition: 'width 0.05s ease', opacity: 0.8 }} />}
          <button className="action-btn" onClick={() => handleCapture(false)}><Eye size={20} /></button>
          <input className="input-field" placeholder={isLiveMode ? "Listening..." : "Ask Spectre..."} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendText()} />
          <button className={`action-btn ${input ? 'active' : ''}`} onClick={handleSendText}><ArrowUp size={20} /></button>
        </div>
      </div>

      {showSettings && (
        <div className="settings-overlay">
          <div style={{display:'flex', justifyContent:'space-between', padding:'20px 20px 0'}}>
            <span style={{color:'white', fontWeight:700}}>Spectre Settings</span>
            <button onClick={() => setShowSettings(false)} style={{background:'none', border:'none', color:'white', cursor:'pointer'}}><X size={20}/></button>
          </div>
          <div className="settings-nav">
            <div className={`nav-item ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>General</div>
            <div className={`nav-item ${activeTab === 'intelligence' ? 'active' : ''}`} onClick={() => setActiveTab('intelligence')}>Intelligence</div>
            <div className={`nav-item ${activeTab === 'updates' ? 'active' : ''}`} onClick={() => setActiveTab('updates')}>Updates</div>
          </div>
          <div className="settings-content">
            {activeTab === 'general' && (
              <>
                <div className="setting-box">
                  <div className="setting-section-title" style={{padding:'8px 12px 0'}}>Audio Input</div>
                  <div className="setting-row">
                    <div className="setting-text"><h4>Microphone Source</h4><p>Choose device.</p></div>
                    <select className="styled-select" value={selectedAudioDevice} onChange={(e) => setSelectedAudioDevice(e.target.value)}>
                      <option value="default">Default System</option>
                      {audioDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label.substring(0,25)}...</option>)}
                    </select>
                  </div>
                </div>
                <div className="setting-box">
                  <div className="setting-section-title" style={{padding:'8px 12px 0'}}>Knowledge Base</div>
                  <div style={{padding:'12px'}}>
                    <p style={{fontSize:12, color:'rgba(255,255,255,0.6)', marginBottom:8}}>Context for every answer.</p>
                    <textarea className="styled-textarea" placeholder="E.g., I am a Product Manager..." value={config.systemContext} onChange={(e) => setConfig({...config, systemContext: e.target.value})} />
                  </div>
                </div>
              </>
            )}
            {activeTab === 'intelligence' && (
              <div className="setting-box">
                <div className="setting-row">
                  <div className="setting-text"><h4>AI Provider</h4></div>
                  <select className="styled-select" value={config.provider} onChange={(e) => setConfig({...config, provider: e.target.value})}>
                    <option value="ollama">Ollama (Local)</option>
                    <option value="openai">OpenAI</option>
                    <option value="groq">Groq</option>
                  </select>
                </div>
                {config.provider === 'ollama' ? (
                  <div className="setting-row">
                    <div className="setting-text"><h4>Local Model</h4></div>
                    <select className="styled-select" value={config.model} onChange={(e) => setConfig({...config, model: e.target.value})}>
                      {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                ) : (
                  <div style={{padding:'12px'}}>
                     <div className="setting-text" style={{marginBottom:8}}><h4>API Key</h4></div>
                     <input className="styled-input" type="password" style={{textAlign:'left', width:'100%', background:'rgba(0,0,0,0.3)', padding:10, borderRadius:8}} value={config.apiKey} onChange={(e) => setConfig({...config, apiKey: e.target.value})} />
                     <div className="setting-text" style={{marginTop:12, marginBottom:8}}><h4>Model Name</h4></div>
                     <input className="styled-input" style={{textAlign:'left', width:'100%', background:'rgba(0,0,0,0.3)', padding:10, borderRadius:8}} value={config.model} onChange={(e) => setConfig({...config, model: e.target.value})} />
                  </div>
                )}
              </div>
            )}
            {activeTab === 'updates' && (
              <div className="setting-box" style={{textAlign:'center', padding:'30px'}}>
                <Cloud size={40} color="var(--accent)" style={{marginBottom:10}} />
                <h3 style={{margin:0}}>Updates</h3>
                <p style={{fontSize:13, color:'rgba(255,255,255,0.5)', marginTop:5}}>
                  {updateState.status === 'idle' && 'Your app is up to date.'}
                  {updateState.status === 'checking' && 'Checking...'}
                  {updateState.status === 'latest' && 'You have the latest version.'}
                  {updateState.status === 'available' && `New version ${updateState.version} available!`}
                  {updateState.status === 'downloading' && `Downloading... ${Math.round(updateState.percent || 0)}%`}
                  {updateState.status === 'ready' && 'Restart to install.'}
                </p>
                <div style={{marginTop:20, display:'flex', justifyContent:'center', gap:10}}>
                   {(updateState.status === 'idle' || updateState.status === 'latest' || updateState.status === 'error') && <button className="btn-primary" onClick={() => window.electronAPI.checkForUpdates()}>Check for Updates</button>}
                   {updateState.status === 'available' && <button className="btn-primary" onClick={() => window.electronAPI.downloadUpdate()}><Download size={14}/> Download</button>}
                   {updateState.status === 'ready' && <button className="btn-primary" style={{background:'#22c55e', color:'white'}} onClick={() => window.electronAPI.quitAndInstall()}>Restart</button>}
                </div>
              </div>
            )}
          </div>
          <div style={{padding:24, borderTop:'1px solid rgba(255,255,255,0.1)', display:'flex', justifyContent:'space-between'}}>
            <button className="btn-danger" onClick={() => window.electronAPI.quitApp()}><Power size={14}/> Quit</button>
            <button className="btn-primary" onClick={saveSettings}>Save Changes</button>
          </div>
        </div>
      )}
    </div>
  );
};
export default MainInterface;