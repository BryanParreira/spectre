// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, Settings, X, Eye, EyeOff, 
  MessageSquare, Sparkles, Send, GripHorizontal, 
  Camera, Terminal, Cpu, Key, Monitor, Loader2
} from 'lucide-react';
import { MarkdownMessage } from './MarkdownMessage';
import './index.css';

const DEFAULT_SYSTEM = "You are Aura, an intelligent, invisible OS copilot. Be concise and direct.";

// --- DRAGGABLE COMPONENT ---
const Draggable = ({ children, initialPos, onDragStart, onDragEnd }) => {
  const [pos, setPos] = useState(initialPos);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('textarea') || e.target.closest('.no-drag')) return;
    setIsDragging(true);
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    onDragStart && onDragStart();
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    };
    const handleMouseUp = () => { if(isDragging) { setIsDragging(false); onDragEnd && onDragEnd(); } };
    
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return <div style={{ left: pos.x, top: pos.y, position: 'absolute', zIndex: 9999 }} onMouseDown={handleMouseDown}>{children}</div>;
};

const MainInterface = () => {
  const [messages, setMessages] = useState([{ id: 1, text: "Aura Online.", sender: 'ai' }]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [attachment, setAttachment] = useState(null); 
  
  const [config, setConfig] = useState({
    provider: localStorage.getItem('provider') || 'ollama',
    apiKey: localStorage.getItem('apiKey') || '',
    model: localStorage.getItem('model') || '',
    systemContext: localStorage.getItem('systemContext') || DEFAULT_SYSTEM
  });
  const [ollamaModels, setOllamaModels] = useState([]);

  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);

  const handleInteractStart = () => window.electronAPI.setIgnoreMouse(false);
  const handleInteractEnd = () => window.electronAPI.setIgnoreMouse(true);

  useEffect(() => {
    window.electronAPI.setIgnoreMouse(true);
    if (config.provider === 'ollama') fetchOllamaModels();
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, config.provider]);

  const fetchOllamaModels = async () => {
    try {
      const res = await fetch('http://localhost:11434/api/tags');
      const data = await res.json();
      setOllamaModels(data.models.map(m => m.name));
      if (!config.model && data.models.length > 0) setConfig(p => ({...p, model: data.models[0].name}));
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
      const image = await window.electronAPI.captureScreen();
      setMessages(p => [...p, { id: Date.now(), text: "Analyze this screen.", sender: 'user', isImage: true }]);
      if (!showChat) setShowChat(true);
      callAI("Describe what is on this screen and provide any relevant insights.", image);
    } catch (e) { console.error("Capture failed"); }
  };

  const callAI = async (prompt, directImage = null) => {
    setIsLoading(true);
    try {
      const { provider, apiKey, model, systemContext } = config;
      let responseText = "";
      const imageSource = directImage || attachment;
      const imageBase64 = imageSource ? imageSource.split(',')[1] : null;
      
      if (provider === 'ollama') {
        const res = await fetch('http://localhost:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            model: model || 'llama3',
            messages: [{
              role: 'user',
              content: `${systemContext}\n\n${prompt}`,
              images: imageBase64 ? [imageBase64] : undefined
            }],
            stream: false
          })
        });
        const data = await res.json();
        responseText = data.message.content;
      } 
      else if (provider === 'openai') {
        const content = [{ type: "text", text: `${systemContext}\n\n${prompt}` }];
        if (imageBase64) content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } });
        
        const res = await window.electronAPI.proxyRequest({
          url: 'https://api.openai.com/v1/chat/completions',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: { model: model || 'gpt-4o', messages: [{role: 'user', content}] }
        });
        responseText = res.data.choices[0].message.content;
      }
      else if (provider === 'anthropic') {
        const content = [{ type: "text", text: prompt }];
        if (imageBase64) content.unshift({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } });

        const res = await window.electronAPI.proxyRequest({
          url: 'https://api.anthropic.com/v1/messages',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: { model: model || 'claude-3-opus-20240229', max_tokens: 1024, system: systemContext, messages: [{role: 'user', content}] }
        });
        responseText = res.data.content[0].text;
      }
      else if (provider === 'gemini') {
        const parts = [{ text: `${systemContext}\n\n${prompt}` }];
        const res = await window.electronAPI.proxyRequest({
          url: `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-pro'}:generateContent?key=${apiKey}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { contents: [{ parts }] }
        });
        responseText = res.data.candidates[0].content.parts[0].text;
      }

      setMessages(p => [...p, { id: Date.now(), text: responseText, sender: 'ai' }]);
    } catch (e) {
      setMessages(p => [...p, { id: Date.now(), text: `⚠️ Error: ${e.message}`, sender: 'ai' }]);
    } finally {
      setIsLoading(false);
      setAttachment(null);
    }
  };

  const handleSend = () => {
    if (!input.trim() && !attachment) return;
    setMessages(p => [...p, { id: Date.now(), text: input || "[Image Sent]", sender: 'user' }]);
    setInput("");
    callAI(input || "Analyze this context.");
  };

  const toggleLive = () => {
    if (isLive) { recognitionRef.current?.stop(); setIsLive(false); }
    else {
      const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Speech) return;
      const rec = new Speech();
      rec.continuous = true; rec.interimResults = true;
      rec.onresult = (e) => {
        const result = e.results[e.results.length-1];
        if (result.isFinal) {
           const t = result[0].transcript;
           setMessages(p => [...p, {id: Date.now(), text: t, sender: 'user'}]);
           callAI(t);
        }
      };
      rec.start();
      recognitionRef.current = rec;
      setIsLive(true);
    }
  };

  return (
    <div className="invisible-canvas">
      <Draggable 
        initialPos={{ x: window.innerWidth/2 - 150, y: 50 }} 
        onDragStart={handleInteractStart}
        onDragEnd={() => {}} 
      >
        <div 
          className="unified-widget-container"
          onMouseEnter={handleInteractStart}
          onMouseLeave={handleInteractEnd}
        >
          <div className="widget-pill">
            <div className="drag-handle"><GripHorizontal size={14} color="rgba(255,255,255,0.3)"/></div>
            
            <button className="pill-btn icon-only" onClick={handleCapture} title="Snap Screen">
              <Camera size={14} />
            </button>

            <div className="divider" />
            
            <button className="pill-btn" onClick={() => setShowChat(!showChat)}>{showChat ? "Hide" : "Show"}</button>
            <button className="pill-btn" onClick={toggleLive} style={{color: isLive ? '#ef4444' : 'white'}}>
              {isLive ? <Mic size={14}/> : <MicOff size={14}/>}
            </button>
            <button className="pill-btn stop-btn" onClick={() => window.electronAPI.quitApp()}><div className="stop-square"/></button>
          </div>

          {showChat && (
            <div className="chat-window">
              <div className="chat-header">
                <button className="header-action" onClick={() => setShowSettings(!showSettings)}><Settings size={14}/></button>
                <div className="header-status">
                  {isLive ? <span className="status-live">● Listening</span> : <span className="status-idle">● Ready</span>}
                </div>
                <button className="header-action close" onClick={() => setShowChat(false)}><X size={14}/></button>
              </div>

              {showSettings ? (
                <div className="settings-panel no-drag">
                  <div className="setting-header">
                    <span>Aura Config</span>
                    <button className="close-settings" onClick={() => setShowSettings(false)}><X size={14}/></button>
                  </div>
                  
                  <div className="setting-section">
                    <div className="section-title"><Cpu size={12}/> Brain</div>
                    <div className="setting-group">
                      <label>Provider</label>
                      <select value={config.provider} onChange={e => setConfig({...config, provider: e.target.value})}>
                        <option value="ollama">Ollama (Local)</option>
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="gemini">Google Gemini</option>
                      </select>
                    </div>

                    {config.provider === 'ollama' ? (
                      <div className="setting-group">
                        <label>Model</label>
                        <select value={config.model} onChange={e => setConfig({...config, model: e.target.value})}>
                          {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    ) : (
                      <div className="setting-group">
                        <label>API Key</label>
                        <input type="password" value={config.apiKey} onChange={e => setConfig({...config, apiKey: e.target.value})} placeholder="sk-..." />
                      </div>
                    )}
                  </div>

                  <div className="setting-section">
                    <div className="section-title"><Terminal size={12}/> System</div>
                    <textarea 
                      className="system-prompt-area" 
                      value={config.systemContext} 
                      onChange={e => setConfig({...config, systemContext: e.target.value})}
                      placeholder="System Instructions..."
                    />
                  </div>

                  <button className="btn-save" onClick={saveSettings}>Apply</button>
                </div>
              ) : (
                <>
                  <div className="messages-area no-drag">
                    {messages.map((m) => (
                      <div key={m.id} className={`msg-row ${m.sender}`}>
                        <div className="msg-bubble">
                          {m.isImage ? <span>📸 [Screen Snapshot]</span> : (m.sender === 'ai' ? <MarkdownMessage content={m.text}/> : m.text)}
                        </div>
                      </div>
                    ))}
                    
                    {isLoading && (
                      <div className="msg-row ai">
                        <div className="msg-bubble thinking-bubble">
                          <span className="thinking-dot"></span>
                          <span className="thinking-dot"></span>
                          <span className="thinking-dot"></span>
                          <span style={{marginLeft: 8, fontSize: 12, opacity: 0.7}}>Thinking...</span>
                        </div>
                      </div>
                    )}
                    
                    <div ref={chatEndRef} />
                  </div>

                  {attachment && (
                    <div className="attachment-preview no-drag">
                      <img src={attachment} className="thumb" />
                      <span>Ready to send</span>
                      <button onClick={() => setAttachment(null)}><X size={12}/></button>
                    </div>
                  )}

                  <div className="input-box no-drag">
                    <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Ask Aura..." />
                    <button className="send-btn" onClick={handleSend}><Send size={14}/></button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </Draggable>
    </div>
  );
};

export default MainInterface;