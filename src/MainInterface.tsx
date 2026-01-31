// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, Settings, X, GripHorizontal, 
  Camera, Send, Eye, EyeOff, Power, Cpu, Terminal
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
  const [messages, setMessages] = useState([{ id: 1, text: "Welcome to Aura", sender: 'ai' }]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  
  const [config, setConfig] = useState({
    provider: localStorage.getItem('provider') || 'ollama',
    apiKey: localStorage.getItem('apiKey') || '',
    model: localStorage.getItem('model') || '',
    systemContext: localStorage.getItem('systemContext') || DEFAULT_SYSTEM
  });
  const [ollamaModels, setOllamaModels] = useState([]);
  const chatEndRef = useRef(null);

  useEffect(() => {
    window.electronAPI.setIgnoreMouse(true);
    if (config.provider === 'ollama') fetchOllamaModels();
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  const callAI = async (prompt, img = null) => {
    setIsLoading(true);
    try {
      const { provider, apiKey, model } = config;
      let responseText = "";
      const imageBase64 = img ? img.split(',')[1] : null;

      if (provider === 'ollama') {
        const res = await window.electronAPI.proxyRequest({
          url: 'http://localhost:11434/api/chat',
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: { model: model || 'llama3', messages: [{role:'user', content: prompt, images: imageBase64 ? [imageBase64] : undefined}], stream: false }
        });
        responseText = res.data.message.content;
      } 
      else if (provider === 'openai') {
        const content = [{ type: "text", text: prompt }];
        if (imageBase64) content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } });
        const res = await window.electronAPI.proxyRequest({
          url: 'https://api.openai.com/v1/chat/completions',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: { model: model || 'gpt-4o', messages: [{role: 'user', content}] }
        });
        responseText = res.data.choices[0].message.content;
      }

      setMessages(p => [...p, { id: Date.now(), text: responseText, sender: 'ai' }]);
    } catch (e) {
      setMessages(p => [...p, { id: Date.now(), text: "Connection error.", sender: 'ai' }]);
    } finally {
      setIsLoading(false);
    }
  };

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
                <div className="setting-section"><div className="section-title"><Cpu size={12}/> Brain</div>
                  <div className="setting-row"><select className="setting-input" value={config.provider} onChange={e => setConfig({...config, provider: e.target.value})}><option value="ollama">Ollama (Local)</option><option value="openai">OpenAI</option></select></div>
                  {config.provider === 'ollama' ? 
                    <div className="setting-row"><select className="setting-input" value={config.model} onChange={e => setConfig({...config, model: e.target.value})}>{ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}</select></div> : 
                    <div className="setting-row"><input className="setting-input" type="password" value={config.apiKey} onChange={e => setConfig({...config, apiKey: e.target.value})} placeholder="API Key..." /></div>
                  }
                </div>
                <div className="setting-section"><div className="section-title"><Terminal size={12}/> Persona</div><textarea className="setting-input area" value={config.systemContext} onChange={e => setConfig({...config, systemContext: e.target.value})} /></div>
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
                    <button className="icon-btn" onClick={handleSend}><Send size={14}/></button>
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