// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { Eye, ArrowUp, Settings, X, Power, Sparkles, Copy, RefreshCw, Terminal, Search, Bug, FileText, Paperclip, Clipboard } from 'lucide-react';
import { MarkdownMessage } from './MarkdownMessage';
import './index.css';

const MainInterface = () => {
  // Load initial messages from local storage (Memory)
  const loadMemory = () => {
    try {
      const saved = localStorage.getItem('spectre_memory');
      return saved ? JSON.parse(saved) : [{ id: 1, text: "Spectre Ready. Drag files or paste context.", sender: 'ai' }];
    } catch (e) { return [{ id: 1, text: "Spectre Ready.", sender: 'ai' }]; }
  };

  const [messages, setMessages] = useState(loadMemory);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  
  // ATTACHMENTS (Image OR Text File)
  const [attachment, setAttachment] = useState(null); // { type: 'image' | 'file', content: string, name: string }
  const [clipboardDetected, setClipboardDetected] = useState("");

  const [config, setConfig] = useState({
    provider: (localStorage.getItem('provider') || 'ollama'),
    apiKey: localStorage.getItem('apiKey') || '',
    model: localStorage.getItem('model') || 'llama3.2',
    systemContext: localStorage.getItem('systemContext') || ''
  });
  const [ollamaModels, setOllamaModels] = useState([]);
  const chatEndRef = useRef(null);

  // SAVE MEMORY
  useEffect(() => {
    localStorage.setItem('spectre_memory', JSON.stringify(messages.slice(-20))); // Keep last 20 messages
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, attachment]);

  // INITIAL LOAD & EVENTS
  useEffect(() => {
    if (config.provider === 'ollama') fetchOllamaModels();

    // GOD MODE: Listen for wake up
    if (window.electronAPI?.onAppWokeUp) {
      window.electronAPI.onAppWokeUp(async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text && text.trim().length > 0) {
            setClipboardDetected(text.substring(0, 50) + "...");
            // Optional: Auto-paste if you want aggressive mode
            // setInput(prev => prev + " \n" + text);
          }
        } catch (e) {}
      });
    }

    // Drag & Drop Handlers
    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
    const handleDrop = async (e) => {
      e.preventDefault(); e.stopPropagation();
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        // Read file content
        const text = await file.text();
        setAttachment({ type: 'file', content: text, name: file.name });
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

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
  
  const handleClearMemory = () => {
    setMessages([{ id: Date.now(), text: "Memory cleared.", sender: 'ai' }]);
    localStorage.removeItem('spectre_memory');
  };

  const handleCapture = async () => {
    try {
      const dataURL = await window.electronAPI.captureScreen();
      const base64 = dataURL.split(',')[1];
      setAttachment({ type: 'image', content: base64, name: 'Screenshot' });
    } catch (e) { addMessage("Capture failed.", 'ai'); }
  };

  const handlePasteClipboard = async () => {
    const text = await navigator.clipboard.readText();
    setInput(prev => prev + (prev ? "\n" : "") + text);
    setClipboardDetected("");
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachment) || isLoading) return;
    
    const txt = input;
    const att = attachment;
    
    setInput("");
    setAttachment(null);
    setShowPrompts(false);
    setClipboardDetected("");

    // Display User Message
    let displayTxt = txt;
    if (att) displayTxt = `<i>[${att.type === 'image' ? 'Image' : 'File'}: ${att.name}]</i><br/>${txt}`;
    addMessage(displayTxt, "user");

    // Construct Context
    let fullPrompt = txt;
    let imageBase64 = null;

    if (att) {
      if (att.type === 'file') {
        fullPrompt = `FILE CONTENT (${att.name}):\n${att.content}\n\nUSER QUESTION:\n${txt}`;
      } else if (att.type === 'image') {
        imageBase64 = att.content;
      }
    }

    await callAI(fullPrompt, imageBase64);
  };

  const callAI = async (prompt, imageBase64) => {
    setIsLoading(true);
    try {
      const finalPrompt = config.systemContext ? `SYSTEM: ${config.systemContext}\n\nUSER: ${prompt}` : prompt;
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
      
      addMessage(reply, 'ai');
    } catch (e) { addMessage(`Error: ${e.message}`, 'ai'); } 
    finally { setIsLoading(false); }
  };

  return (
    <div className="app-container">
      <div className="header-drag-area"></div>
      
      {/* HEADER CONTROLS */}
      <div className="status-indicator">
        <div className={`dot ${config.provider === 'ollama' ? '' : 'offline'}`} />
        <span>{config.provider === 'ollama' ? 'LOCAL' : 'CLOUD'}</span>
      </div>
      
      <div style={{position:'absolute', top:16, right:16, zIndex:50, display:'flex', gap:10}}>
        <button className="settings-trigger" onClick={handleClearMemory} title="Clear Memory" style={{position:'static'}}><RefreshCw size={16} /></button>
        <button className="settings-trigger" onClick={() => setShowSettings(true)} style={{position:'static'}}><Settings size={18} /></button>
      </div>

      {/* CHAT AREA */}
      <div className="chat-area">
        {messages.map((msg) => (
          <div key={msg.id} className="message-group">
            {msg.sender === 'ai' && (
              <div className="message-actions">
                <button className="msg-btn" onClick={() => navigator.clipboard.writeText(msg.text)} title="Copy"><Copy size={12} /></button>
              </div>
            )}
            <div className={`message ${msg.sender}`}>
              {msg.sender === 'ai' ? <MarkdownMessage content={msg.text} /> : <div dangerouslySetInnerHTML={{ __html: msg.text }} />}
            </div>
          </div>
        ))}
        {isLoading && <div className="message ai">Thinking...</div>}
        <div ref={chatEndRef} />
      </div>

      {/* GOD MODE CLIPBOARD DETECTOR */}
      {clipboardDetected && !input && (
        <div style={{
          position:'absolute', bottom: 80, left:20, right:20, 
          background:'rgba(59, 130, 246, 0.2)', border:'1px solid #3b82f6', 
          borderRadius:8, padding:'8px 12px', display:'flex', alignItems:'center', justifyContent:'space-between',
          fontSize:12, color:'#93c5fd', cursor:'pointer', backdropFilter:'blur(10px)', zIndex:60
        }} onClick={handlePasteClipboard}>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <Clipboard size={14}/> <span>Paste from clipboard: "{clipboardDetected}"</span>
          </div>
          <ArrowUp size={14}/>
        </div>
      )}

      {/* PROMPT LIBRARY */}
      {showPrompts && (
        <div className="prompt-menu">
          <div className="prompt-item" onClick={() => { setInput("Explain this code logic"); setShowPrompts(false); }}><Terminal size={14}/> Explain Code</div>
          <div className="prompt-item" onClick={() => { setInput("Refactor this for performance"); setShowPrompts(false); }}><Sparkles size={14}/> Refactor</div>
          <div className="prompt-item" onClick={() => { setInput("Find bugs in this snippet"); setShowPrompts(false); }}><Bug size={14}/> Find Bugs</div>
        </div>
      )}

      {/* INPUT AREA */}
      <div className="input-section">
        {attachment && (
          <div className="attachment-preview">
            {attachment.type === 'image' ? <img src={`data:image/jpeg;base64,${attachment.content}`} className="preview-thumb" /> : <FileText size={16} color="#aaa"/>}
            <span className="preview-text">{attachment.name.substring(0,20)}</span>
            <button className="preview-close" onClick={() => setAttachment(null)}><X size={14}/></button>
          </div>
        )}

        <div className="input-wrapper">
          <button className={`action-btn ${attachment?.type === 'image' ? 'active' : ''}`} onClick={handleCapture} title="Capture Screen"><Eye size={20} /></button>
          <input 
            className="input-field" 
            placeholder="Ask or Drag Files... (Type / for prompts)" 
            value={input} 
            onChange={(e) => {
              setInput(e.target.value);
              setShowPrompts(e.target.value === '/');
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            autoFocus 
          />
          <button className={`action-btn ${input || attachment ? 'active' : ''}`} onClick={handleSend}><ArrowUp size={20} /></button>
        </div>
      </div>

      {/* SETTINGS OVERLAY */}
      {showSettings && (
        <div className="settings-overlay">
          <div className="settings-header"><span>Settings</span><button onClick={() => setShowSettings(false)} style={{background:'none',border:'none',color:'white',cursor:'pointer'}}><X size={20}/></button></div>
          <div className="setting-row">
            <label style={{fontSize:12,color:'#888'}}>AI Provider</label>
            <select className="styled-select" value={config.provider} onChange={(e) => setConfig({...config, provider: e.target.value})}>
              <option value="ollama">Ollama (Local)</option>
              <option value="openai">OpenAI</option>
              <option value="groq">Groq</option>
            </select>
          </div>
          {config.provider === 'ollama' ? (
             <div className="setting-row">
               <label style={{fontSize:12,color:'#888'}}>Local Model</label>
               <select className="styled-select" value={config.model} onChange={(e) => setConfig({...config, model: e.target.value})}>{ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}</select>
             </div>
          ) : (
            <>
              <div className="setting-row"><label style={{fontSize:12,color:'#888'}}>API Key</label><input className="styled-input" type="password" value={config.apiKey} onChange={(e) => setConfig({...config, apiKey: e.target.value})} /></div>
              <div className="setting-row"><label style={{fontSize:12,color:'#888'}}>Model Name</label><input className="styled-input" value={config.model} onChange={(e) => setConfig({...config, model: e.target.value})} /></div>
            </>
          )}
          <div className="setting-row"><label style={{fontSize:12,color:'#888'}}>System Context</label><textarea className="styled-input" style={{height:80}} value={config.systemContext} onChange={(e) => setConfig({...config, systemContext: e.target.value})} /></div>
          <button className="btn-primary" onClick={saveSettings}>Save Changes</button>
          <button className="btn-danger" onClick={() => window.electronAPI.quitApp()}>Quit App</button>
        </div>
      )}
    </div>
  );
};
export default MainInterface;