// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, Settings, X, Eye, EyeOff, 
  MessageSquare, Layout, Move, Scroll, 
  Sparkles, Send, Command
} from 'lucide-react';
import { MarkdownMessage } from './MarkdownMessage';
import './index.css';

const AUTO_ANSWERS = {
  "pricing": "We offer 3 tiers: Starter (Free), Pro ($20/mo), and Enterprise.",
  "competitors": "Our main advantage is local-first privacy and zero latency.",
  "meeting": "I can summarize this meeting instantly. Just say 'Recap'."
};

const MainInterface = () => {
  // --- STATE ---
  const [messages, setMessages] = useState([{ id: 1, text: "Spectre Ready.", sender: 'ai' }]);
  const [input, setInput] = useState("");
  const [isLive, setIsLive] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  
  const [undetectable, setUndetectable] = useState(false);
  const [autoAnswer, setAutoAnswer] = useState(true);
  
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);

  // --- MOUSE HANDLING ---
  // If we don't do this, the "invisible" background blocks clicks to your desktop
  const handleMouseEnter = () => window.electronAPI.setIgnoreMouse(false);
  const handleMouseLeave = () => window.electronAPI.setIgnoreMouse(true);

  useEffect(() => {
    // Default: Click-through mode
    window.electronAPI.setIgnoreMouse(true);
    if (window.electronAPI.onAppWokeUp) window.electronAPI.onAppWokeUp(() => setShowChat(true));
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- LIVE SPEECH ---
  const toggleLive = () => { isLive ? stopSpeech() : startSpeech(); };

  const startSpeech = () => {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) return;
    const recognition = new Speech();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (e) => {
      const transcript = e.results[e.results.length - 1][0].transcript.toLowerCase();
      if (autoAnswer) {
        Object.keys(AUTO_ANSWERS).forEach(key => {
          if (transcript.includes(key)) {
            setMessages(p => [...p, { id: Date.now(), text: `💡 Auto-Answer: ${AUTO_ANSWERS[key]}`, sender: 'ai' }]);
          }
        });
      }
    };
    recognition.start();
    recognitionRef.current = recognition;
    setIsLive(true);
  };

  const stopSpeech = () => {
    recognitionRef.current?.stop();
    setIsLive(false);
  };

  const toggleUndetectable = (val) => {
    setUndetectable(val);
    window.electronAPI.setUndetectable(val);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages(p => [...p, { id: Date.now(), text: input, sender: 'user' }]);
    setInput("");
    setTimeout(() => {
      setMessages(p => [...p, { id: Date.now(), text: "I'm checking that context for you.", sender: 'ai' }]);
    }, 600);
  };

  return (
    <div className="overlay-container">
      
      {/* 1. WIDGET PILL */}
      <div 
        className="widget-pill"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="logo-icon">
          <Sparkles size={14} color="#fff" />
        </div>
        
        <button className="pill-btn" onClick={() => setShowChat(!showChat)}>
          {showChat ? "Hide" : "Show"}
        </button>
        
        <button 
          className="pill-btn" 
          onClick={toggleLive}
          style={{color: isLive ? '#ef4444' : 'white'}}
        >
          {isLive ? <Mic size={14} /> : <MicOff size={14} />}
        </button>

        <button className="pill-btn stop-btn" onClick={() => window.electronAPI.quitApp()}>
          <div className="stop-square" />
        </button>
      </div>

      {/* 2. SETTINGS MENU */}
      {showSettings && (
        <div 
          className="settings-menu"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="setting-item">
            <EyeOff size={14} /> <span>Undetectability</span>
            <input type="checkbox" checked={undetectable} onChange={(e) => toggleUndetectable(e.target.checked)} />
          </div>
          <div className="setting-item">
            <MessageSquare size={14} /> <span>Show/Hide Chat</span>
            <input type="checkbox" checked={showChat} onChange={() => setShowChat(!showChat)} />
          </div>
          <div className="setting-item">
            <Sparkles size={14} /> <span>Auto-Answer</span>
            <input type="checkbox" checked={autoAnswer} onChange={(e) => setAutoAnswer(e.target.checked)} />
          </div>
          <div className="setting-item footer">
            <span style={{fontSize:10, color:'#666'}}>Cmd+Shift+G to Toggle</span>
          </div>
        </div>
      )}

      {/* 3. CHAT WINDOW */}
      {showChat && (
        <div 
          className="chat-window"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="chat-header">
            <button className="header-action" onClick={() => setShowSettings(!showSettings)}>
              <Settings size={14} />
            </button>
            <div className="header-status">
              {isLive ? <span className="status-live">● Live</span> : <span className="status-idle">● Ready</span>}
            </div>
            <button className="header-action close" onClick={() => setShowChat(false)}>
              <X size={14} />
            </button>
          </div>

          <div className="messages-area">
            {messages.map((m) => (
              <div key={m.id} className={`msg-row ${m.sender}`}>
                <div className="msg-bubble">{m.sender === 'ai' ? <MarkdownMessage content={m.text}/> : m.text}</div>
                {m.sender === 'user' && <div className="msg-meta">Sent via input</div>}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="suggestion-bar">
            <span>✨ Assist</span>
            <span>✎ Draft Reply</span>
            <span>💬 Summary</span>
          </div>

          <div className="input-box">
            <input 
              placeholder="Ask about your screen or conversation..." 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              autoFocus
            />
            <div className="input-controls">
              <button className="send-btn" onClick={handleSend}><Send size={14} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainInterface;