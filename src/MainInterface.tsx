// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mic, MicOff, Settings, X, GripHorizontal, 
  Camera, Send, Eye, EyeOff, Power, Cpu, Terminal, 
  RefreshCw, Download, AlertCircle, CheckCircle, Square, Trash2
} from 'lucide-react';
import { MarkdownMessage } from './MarkdownMessage';
import './index.css';

const DEFAULT_SYSTEM = "You are Aura, an intelligent OS copilot. Be concise.";

// --- DRAGGABLE COMPONENT ---
const Draggable = ({ children, initialPos }) => {
  const [pos, setPos] = useState(initialPos);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('textarea') || e.target.closest('.no-drag')) return;
    isDragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    window.electronAPI.setIgnoreMouse(false);
  };

  useEffect(() => {
    const move = (e) => { if (isDragging.current) setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y }); };
    const up = () => { isDragging.current = false; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  const handleMouseEnter = () => window.electronAPI.setIgnoreMouse(false);
  const handleMouseLeave = () => { if (!isDragging.current) window.electronAPI.setIgnoreMouse(true); };

  return (
    <div 
      style={{ left: pos.x, top: pos.y, position: 'absolute', zIndex: 9999, display:'flex', flexDirection:'column', alignItems:'center' }}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter} 
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  );
};

const MainInterface = () => {
  // 1. IMPROVEMENT: Load initial state from LocalStorage (Persistence)
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('aura_history');
    return saved ? JSON.parse(saved) : [{ id: 1, text: "Welcome to Aura", sender: 'ai' }];
  });
  
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  
  // Update State
  const [updateStatus, setUpdateStatus] = useState({ status: 'idle', percent: 0, error: null });

  const [config, setConfig] = useState({
    provider: localStorage.getItem('provider') || 'ollama',
    apiKey: localStorage.getItem('apiKey') || '',
    model: localStorage.getItem('model') || '',
    systemContext: localStorage.getItem('systemContext') || DEFAULT_SYSTEM
  });
  const [ollamaModels, setOllamaModels] = useState([]);
  const chatEndRef = useRef(null);
  
  // 2. IMPROVEMENT: Stop Generating Capability
  const abortController = useRef(null);

  // 3. IMPROVEMENT: Persist Chat History
  useEffect(() => {
    localStorage.setItem('aura_history', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    window.electronAPI.setIgnoreMouse(true);
    if (config.provider === 'ollama') fetchOllamaModels();
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });

    // Update Listener
    window.electronAPI.onUpdateMsg((msg) => {
      console.log("Update Msg:", msg);
      if (msg.status === 'available') setUpdateStatus({ status: 'available', percent: 0 });
      if (msg.status === 'downloading') setUpdateStatus({ status: 'downloading', percent: Math.round(msg.percent) });
      if (msg.status === 'ready') setUpdateStatus({ status: 'ready', percent: 100 });
      if (msg.status === 'uptodate') setUpdateStatus({ status: 'uptodate', percent: 0 });
      if (msg.status === 'error') setUpdateStatus({ status: 'error', error: msg.error });
    });

  }, [messages, config.provider]);

  const fetchOllamaModels = async () => {
    try {
      const res = await window.electronAPI.proxyRequest({
        url: 'http://localhost:11434/api/tags', method: 'GET', headers: {}
      });
      if (res.data?.models) {
        setOllamaModels(res.data.models.map(m => m.name));
        if (!config.model && res.data.models.length > 0) setConfig(p => ({...p, model: res.data.models[0].name}));
      }
    } catch (e) {}
  };

  const saveSettings = () => {
    localStorage.setItem('provider', config.provider);
    localStorage.setItem('apiKey', config.apiKey);
    localStorage.setItem('model', config.model);
    localStorage.setItem('systemContext', config.systemContext);
    setShowSettings(false);
  };

  const checkForUpdates = () => {
    setUpdateStatus({ status: 'checking', percent: 0 });
    window.electronAPI.checkForUpdates();
  };

  const quitAndInstall = () => {
    window.electronAPI.quitAndInstall();
  };

  const handleCapture = async () => {
    try {
      const img = await window.electronAPI.captureScreen();
      setMessages(p => [...p, { id: Date.now(), text: "Analyze this screen.", sender: 'user', isImage: true }]);
      if (!showChat) setShowChat(true);
      callAI("Describe this screen.", img);
    } catch (e) {}
  };

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages(p => [...p, { id: Date.now(), text: input, sender: 'user' }]);
    setInput("");
    callAI(input);
  };

  const handleStop = () => {
    if (abortController.current) {
      abortController.current.abort();
      abortController.current = null;
    }
    setIsLoading(false);
  };

  const clearHistory = () => {
    setMessages([{ id: 1, text: "Welcome to Aura", sender: 'ai' }]);
  };

  // 4. IMPROVEMENT: Context-Aware AI Call
  const callAI = async (prompt, img = null) => {
    // Stop previous request if active
    if (abortController.current) abortController.current.abort();
    abortController.current = new AbortController();

    setIsLoading(true);
    try {
      const { provider, apiKey, model, systemContext } = config;
      let responseText = "";
      const imageBase64 = img ? img.split(',')[1] : null;

      // Prepare History (Last 10 messages to maintain context window)
      const history = messages.slice(-10).map(m => ({
        role: m.sender === 'ai' ? 'assistant' : 'user',
        content: m.text
      }));

      // Add System Prompt
      const fullMessages = [
        { role: 'system', content: systemContext || DEFAULT_SYSTEM },
        ...history
      ];

      if (provider === 'ollama') {
        // Construct Ollama payload
        const newMessage = { role: 'user', content: prompt };
        if (imageBase64) newMessage.images = [imageBase64];
        
        const res = await window.electronAPI.proxyRequest({
          url: 'http://localhost:11434/api/chat',
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: { 
            model: model || 'llama3', 
            messages: [...fullMessages, newMessage], 
            stream: false 
          }
        });
        
        if (abortController.current?.signal.aborted) return;
        responseText = res.data.message?.content || "No response from Ollama.";
      } 
      else if (provider === 'openai') {
        // Construct OpenAI payload
        const content = [{ type: "text", text: prompt }];
        if (imageBase64) content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } });
        
        const res = await window.electronAPI.proxyRequest({
          url: 'https://api.openai.com/v1/chat/completions',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: { 
            model: model || 'gpt-4o', 
            messages: [...fullMessages, { role: 'user', content }] 
          }
        });

        if (abortController.current?.signal.aborted) return;
        responseText = res.data.choices?.[0]?.message?.content || "No response from OpenAI.";
      }

      setMessages(p => [...p, { id: Date.now(), text: responseText, sender: 'ai' }]);
    } catch (e) {
      if (!abortController.current?.signal.aborted) {
        setMessages(p => [...p, { id: Date.now(), text: `Error: ${e.message || "Connection failed"}`, sender: 'ai' }]);
      }
    } finally {
      setIsLoading(false);
      abortController.current = null;
    }
  };

  // 5. IMPROVEMENT: Real Voice Integration
  // Use a ref to access the latest callAI function without triggering re-renders
  const callAIRef = useRef(callAI);
  useEffect(() => { callAIRef.current = callAI; });

  useEffect(() => {
    let recognition = null;

    if (isLive) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false; // Capture one sentence at a time
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => console.log("Voice listening started...");
        
        recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          if (transcript.trim()) {
            setInput(transcript); // Show what was heard
            // Auto-send logic
            setMessages(p => [...p, { id: Date.now(), text: transcript, sender: 'user' }]);
            callAIRef.current(transcript);
          }
        };

        recognition.onerror = (e) => {
          console.error("Speech error:", e.error);
          // If not-allowed, turn off live mode
          if (e.error === 'not-allowed') setIsLive(false);
        };

        recognition.onend = () => {
          // Restart immediately to simulate continuous listening if still live
          if (isLive) {
            try { recognition.start(); } catch (e) {}
          }
        };

        try { recognition.start(); } catch (e) {}
      } else {
        alert("Speech Recognition not supported in this environment.");
        setIsLive(false);
      }
    }

    return () => {
      if (recognition) recognition.stop();
    };
  }, [isLive]);

  return (
    <div className="invisible-canvas">
      <Draggable initialPos={{ x: window.innerWidth/2 - 200, y: 50 }}>
        
        {/* --- NAV BAR (PILL) --- */}
        <div className={`glass-panel widget-pill ${isLoading ? 'thinking-border' : ''}`}>
          <div className="drag-handle"><GripHorizontal size={14} /></div>
          <div className="aura-orb-container"><div className={`aura-orb ${isLoading ? 'active' : ''}`} /></div>
          
          <div className="divider" />

          {/* Voice */}
          <button className={`icon-btn ${isLive ? 'active-live' : ''}`} onClick={() => setIsLive(!isLive)} title="Toggle Voice">
            {isLive ? <Mic size={16} /> : <MicOff size={16} />}
          </button>

          {/* Screenshot */}
          <button className="icon-btn" onClick={handleCapture} title="Snap Screen">
            <Camera size={16} />
          </button>

          <div className="divider" />

          {/* Show/Hide Chat */}
          <button className={`icon-btn ${showChat ? 'active-white' : ''}`} onClick={() => setShowChat(!showChat)} title="Toggle Chat">
            {showChat ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>

          {/* Quit App */}
          <button className="icon-btn danger-hover" onClick={() => window.electronAPI.quitApp()} title="Quit Aura">
            <Power size={16} />
          </button>
        </div>

        {/* --- CHAT WINDOW --- */}
        {showChat && (
          <div className={`glass-panel chat-window ${isLoading ? 'thinking-border' : ''}`}>
            
            {showSettings ? (
              <div className="settings-panel no-drag">
                <div className="setting-header"><span>Config</span><button className="icon-btn" onClick={() => setShowSettings(false)}><X size={16}/></button></div>
                
                {/* Clear History Button added here */}
                <button className="setting-input" onClick={clearHistory} style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', cursor:'pointer', marginBottom:'10px', color: '#ff79c6'}}>
                  <Trash2 size={14}/> Clear Conversation History
                </button>

                <div className="setting-section"><div className="section-title"><Cpu size={12}/> Brain</div>
                  <div className="setting-row"><select className="setting-input" value={config.provider} onChange={e => setConfig({...config, provider: e.target.value})}><option value="ollama">Ollama (Local)</option><option value="openai">OpenAI</option></select></div>
                  {config.provider === 'ollama' ? 
                    <div className="setting-row"><select className="setting-input" value={config.model} onChange={e => setConfig({...config, model: e.target.value})}>{ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}</select></div> : 
                    <div className="setting-row"><input className="setting-input" type="password" value={config.apiKey} onChange={e => setConfig({...config, apiKey: e.target.value})} placeholder="API Key..." /></div>
                  }
                </div>
                <div className="setting-section"><div className="section-title"><Terminal size={12}/> Persona</div><textarea className="setting-input area" value={config.systemContext} onChange={e => setConfig({...config, systemContext: e.target.value})} /></div>
                
                {/* --- UPDATE SECTION --- */}
                <div className="setting-section" style={{marginTop: 'auto', marginBottom: '10px', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px'}}>
                  <div className="section-title" style={{marginBottom:'5px'}}><RefreshCw size={12}/> Updates</div>
                  
                  {updateStatus.status === 'idle' && (
                    <button className="setting-input" onClick={checkForUpdates} style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', cursor:'pointer'}}>
                      <RefreshCw size={14}/> Check for Updates
                    </button>
                  )}

                  {updateStatus.status === 'checking' && (
                    <div style={{fontSize:'12px', color:'#aaa', textAlign:'center', padding:'5px'}}>Checking...</div>
                  )}

                  {updateStatus.status === 'available' && (
                    <div style={{fontSize:'12px', color:'#3b82f6', textAlign:'center', padding:'5px'}}>Update found! Downloading...</div>
                  )}

                  {updateStatus.status === 'downloading' && (
                    <div style={{width:'100%', background:'rgba(255,255,255,0.1)', height:'6px', borderRadius:'3px', overflow:'hidden'}}>
                      <div style={{width: `${updateStatus.percent}%`, background:'#3b82f6', height:'100%'}} />
                    </div>
                  )}

                  {updateStatus.status === 'ready' && (
                    <button className="setting-input" onClick={quitAndInstall} style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', cursor:'pointer', background:'rgba(34, 197, 94, 0.2)', color:'#4ade80'}}>
                      <Download size={14}/> Restart & Install
                    </button>
                  )}

                  {updateStatus.status === 'uptodate' && (
                    <div style={{fontSize:'12px', color:'#4ade80', textAlign:'center', padding:'5px', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px'}}>
                      <CheckCircle size={14}/> Aura is up to date
                    </div>
                  )}

                  {updateStatus.status === 'error' && (
                    <div style={{fontSize:'11px', color:'#ef4444', textAlign:'center', padding:'5px'}}>
                      Error: {updateStatus.error}
                    </div>
                  )}
                </div>

                <button className="save-btn" onClick={saveSettings}>Save</button>
              </div>
            ) : (
              <>
                <div className="chat-header">
                  <span className={`status-text ${isLive ? 'live' : ''}`}>{isLive ? "● LISTENING" : "● AURA READY"}</span>
                  <button className="icon-btn" onClick={() => setShowSettings(!showSettings)}><Settings size={14}/></button>
                </div>

                <div className="chat-body no-drag">
                  {messages.map((m) => (
                    <div key={m.id} className={`msg-row ${m.sender}`}>
                      <div className="msg-bubble">
                        {m.isImage ? "📸 Screen Captured" : <MarkdownMessage content={m.text}/>}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="msg-row ai">
                      <div className="msg-bubble thinking-bubble"><div className="dot"/><div className="dot"/><div className="dot"/></div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="input-area no-drag">
                  <div className="input-glass">
                    <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Ask Aura..." />
                    
                    {/* Send / Stop Toggle */}
                    {isLoading ? (
                      <button className="icon-btn" onClick={handleStop} title="Stop Generating">
                        <Square size={14} fill="currentColor" />
                      </button>
                    ) : (
                      <button className="icon-btn" onClick={handleSend} title="Send">
                        <Send size={14}/>
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Draggable>
    </div>
  );
};

export default MainInterface;