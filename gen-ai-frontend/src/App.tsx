// src/App.tsx
import { useState, useRef, useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from '@aws-amplify/auth';
import { withAuthenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import awsExports from './aws-exports';
import { Toaster, toast } from 'react-hot-toast';

import { ThemeProvider, createTheme } from '@mui/material/styles';
import {
  Box, Container, CssBaseline, Paper, List, ListItem, Avatar, ListItemText,
  Typography, Alert, TextField, FormControl, InputLabel, Select, MenuItem,
  Button, Switch, FormControlLabel, IconButton, Tooltip
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import DashboardIcon from '@mui/icons-material/Dashboard'; // Icon for admin
import ChatIcon from '@mui/icons-material/Chat'; // Icon for chat
import ShareIcon from '@mui/icons-material/Share'; // Icon for share
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks'; // Icon for library
import MicIcon from '@mui/icons-material/Mic'; // Icon for voice
import { ContentCopy as ContentCopyIcon } from '@mui/icons-material';

import { ConversationSidebar } from './ConversationSidebar';
import { AdminDashboard } from './AdminDashboard';
import { PromptLibrary } from './PromptLibrary';

import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import materialDark from 'react-syntax-highlighter/dist/cjs/styles/prism/material-dark';
import materialLight from 'react-syntax-highlighter/dist/cjs/styles/prism/material-light';

Amplify.configure(awsExports);

const drawerWidth = 280;

// --- CONFIG ---
// Copy your admin emails here to control button visibility
const ADMIN_EMAILS = ["your.email@example.com", "sudheer@markitome.com"]; 

type SupportedModel = 'gpt-4' | 'gemini-pro' | 'gemini-2.5-flash' | 'gpt-4o';
interface Message { sender: 'user' | 'ai'; text: string; }
interface Conversation { id: string; title: string; }

// Add Web Speech API type definition
interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

const CodeBlock = ({ node, inline, className, children, darkMode, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    return !inline && match ? (
        <SyntaxHighlighter style={darkMode ? materialDark : materialLight} language={match[1]} PreTag="div" {...props}>
            {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
    ) : ( <code className={className} {...props}>{children}</code> );
};

function App({ signOut, user }: { signOut?: () => void; user?: any }) {
  // --- State Management ---
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState<string>('');
  const [model, setModel] = useState<SupportedModel>('gpt-4o');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [darkMode, setDarkMode] = useState(false);
  const chatEndRef = useRef<null | HTMLDivElement>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [currentView, setCurrentView] = useState<'chat' | 'admin'>('chat');
  const [isLibraryOpen, setIsLibraryOpen] = useState(false); // State for Library Dialog
  
  // --- Voice Input State ---
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const lightTheme = createTheme({ palette: { mode: 'light' } });
  const darkTheme = createTheme({ palette: { mode: 'dark' } });
  const handleThemeChange = () => setDarkMode(!darkMode);

  const CONVERSATIONS_URL = '/api/conversations';
  const GENERATE_URL = '/api/generate';

  const getAuthToken = async () => {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();
    if (!idToken) throw new Error("User is not authenticated.");
    return idToken;
  };

  useEffect(() => {
    const loadConversations = async () => {
      setError('');
      try {
        const token = await getAuthToken();
        const res = await fetch(CONVERSATIONS_URL, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) { const errorData = await res.json(); throw new Error(errorData.detail || "Failed to fetch conversations"); }
        const data = await res.json();
        setConversations(data.map((item: any) => ({
            id: item.id, title: item.title
        })));
      } catch (err: any) { setError(`Failed to load conversations: ${err.message}`); }
    };
    loadConversations();
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSelectConversation = async (id: string) => {
    setActiveConversationId(id); setMessages([]); setError(''); setIsLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${CONVERSATIONS_URL}/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) { const errorData = await res.json(); throw new Error(errorData.detail || "Failed to fetch messages"); }
      const data = await res.json();
      const sortedMessages = data.sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp));
      setMessages(sortedMessages.map((msg: any) => ({ sender: msg.sender, text: msg.text })));
    } catch (err: any) { setError(`Failed to load messages: ${err.message}`); } finally { setIsLoading(false); }
  };

  const handleNewConversation = () => { setActiveConversationId(null); setMessages([]); setPrompt(''); setError(''); };

  const handleDeleteConversation = async (id: string) => {
    setError('');
    try {
      const token = await getAuthToken();
      const response = await fetch(`${CONVERSATIONS_URL}/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.detail || 'Failed to delete conversation'); }
      setConversations(prev => prev.filter(conv => conv.id !== id));
      if (activeConversationId === id) { handleNewConversation(); }
    } catch (error) { throw error; }
  };

  const handleRenameConversation = async (id: string, newTitle: string): Promise<Conversation> => {
    setError('');
    try {
      const token = await getAuthToken();
      const response = await fetch(`${CONVERSATIONS_URL}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ new_title: newTitle }) });
      if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.detail || 'Failed to rename conversation'); }
      const updatedConversation = await response.json();
      setConversations(prev => prev.map(conv => conv.id === id ? { ...conv, title: updatedConversation.title } : conv));
      return updatedConversation;
    } catch (error) { setError(`Rename failed: ${(error as Error).message}`); throw error; }
  };

  const handleCopyText = async (textToCopy: string) => {
    try { await navigator.clipboard.writeText(textToCopy); toast.success('Copied to clipboard!'); } catch (err) { console.error("Failed to copy text: ", err); toast.error('Failed to copy text.'); }
  };

  const handleStopGenerating = () => {
    if (abortController) { abortController.abort(); setAbortController(null); setIsLoading(false); setMessages(prev => { const lastMessage = prev[prev.length - 1]; if (lastMessage && lastMessage.sender === 'ai' && lastMessage.text === '') { return prev.slice(0, -1); } return prev; }); toast.error("Generation stopped by user."); }
  };

  const handleShareChat = async () => {
    if (!activeConversationId) return;
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/conversations/${activeConversationId}/share`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) throw new Error("Failed to generate share link");
      
      const data = await res.json();
      if (!data.shareId) throw new Error("Server did not return a share ID");

      const fullUrl = `${window.location.origin}/share/${data.shareId}`;
      await navigator.clipboard.writeText(fullUrl);
      toast.success("Link copied to clipboard!");
    } catch (err) { console.error(err); toast.error("Failed to generate share link."); }
  };

  // --- Handle Prompt Selection from Library ---
  const handleSelectPrompt = (newPrompt: string) => {
    setPrompt(newPrompt);
    setIsLibraryOpen(false);
  };

  // --- Handle Voice Input ---
  const handleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const windowObj = window as unknown as IWindow;
    const SpeechRecognition = windowObj.SpeechRecognition || windowObj.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("Browser doesn't support speech recognition.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      toast.success("Listening...", { id: 'voice-status' });
    };

    recognition.onend = () => {
      setIsListening(false);
      toast.dismiss('voice-status');
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setPrompt((prev) => prev + (prev ? ' ' : '') + transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      toast.error(`Speech error: ${event.error}`);
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    const userMessage: Message = { sender: 'user', text: prompt };
    const currentPrompt = prompt;
    const currentHistory = [...messages];
    setMessages(prev => [...prev, userMessage]);
    setPrompt(''); setIsLoading(true); setError('');
    const controller = new AbortController(); setAbortController(controller);
    try {
        const token = await getAuthToken();
        const historyForApi = currentHistory.map(msg => ({ role: msg.sender === 'user' ? 'user' : 'model', content: msg.text }));
        const res = await fetch(GENERATE_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ prompt: currentPrompt, model, conversationId: activeConversationId, history: historyForApi, systemPrompt: systemPrompt }),
            signal: controller.signal
        });
        if (controller.signal.aborted) return;
        if (!res.ok) { let errorDetail = `Server error: ${res.status}`; try { const errorData = await res.json(); errorDetail = errorData.detail || errorDetail; } catch (e) {} throw new Error(errorDetail); }
        const data = await res.json();
        if (controller.signal.aborted) return;
        const aiMessage: Message = { sender: 'ai', text: data.text };
        setMessages(prev => [...prev, aiMessage]);
        if (!activeConversationId && data.conversationId) { const newConvId = data.conversationId; setActiveConversationId(newConvId); setConversations(prev => [{ id: newConvId, title: currentPrompt.substring(0, 50) }, ...prev]); }
    } catch (err: any) { if (err.name === 'AbortError') { console.log('Fetch aborted'); } else { setError(err.message); setMessages(prev => prev.slice(0, -1)); } } finally { setIsLoading(false); setAbortController(null); }
  };

  // --- Calculate if User is Admin ---
  const userEmail = user?.signInDetails?.loginId || user?.attributes?.email;
  const isAdmin = userEmail && ADMIN_EMAILS.includes(userEmail);

  return (
    <ThemeProvider theme={darkMode ? darkTheme : lightTheme}>
      <Toaster position="top-center" reverseOrder={false} toastOptions={{ duration: 3000, style: { background: darkMode ? '#333' : '#fff', color: darkMode ? '#fff' : '#333' } }} />
      <CssBaseline />
      
      {/* --- Prompt Library Dialog --- */}
      <PromptLibrary 
        open={isLibraryOpen} 
        onClose={() => setIsLibraryOpen(false)} 
        onSelectPrompt={handleSelectPrompt} 
      />

      <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        {currentView === 'chat' && (
          <ConversationSidebar
            conversations={conversations} onSelectConversation={handleSelectConversation} onNewConversation={handleNewConversation} onDeleteConversation={handleDeleteConversation} onRenameConversation={handleRenameConversation} activeConversationId={activeConversationId}
          />
        )}

        <Container maxWidth={false} sx={{ display: 'flex', flexDirection: 'column', height: '100%', pt: 2, pb: 2, boxSizing: 'border-box', flexGrow: 1, ml: currentView === 'chat' ? `${drawerWidth}px` : 0 }}>
          
          {/* Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, mb: 2 }}>
             {/* Logo, Title, and Tagline */}
             <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <img 
                  src="/markitome-logo.png" 
                  alt="Markitome Logo" 
                  style={{ width: '100px', height: 'auto', borderRadius: '4px' }} 
                />
                <Box>
                  <Typography variant="h5" component="h1" sx={{ fontWeight: 600, lineHeight: 1.2 }}>Markitome AI</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>Your Intelligent Marketing Assistant</Typography>
                </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
               {/* --- Share Button (Visible only if chat is active and in Chat View) --- */}
               {activeConversationId && currentView === 'chat' && (
                  <Button 
                      variant="text" 
                      startIcon={<ShareIcon />} 
                      onClick={handleShareChat}
                      sx={{ mr: 1 }}
                  >
                      Share
                  </Button>
              )}
              {/* --- ADMIN TOGGLE BUTTON --- */}
              {isAdmin && (
                <Button 
                  variant={currentView === 'admin' ? 'contained' : 'text'}
                  onClick={() => setCurrentView(prev => prev === 'chat' ? 'admin' : 'chat')}
                  startIcon={currentView === 'chat' ? <DashboardIcon /> : <ChatIcon />}
                >
                  {currentView === 'chat' ? 'Admin' : 'Chat'}
                </Button>
              )}
              {/* --------------------------- */}
              <FormControlLabel control={<Switch checked={darkMode} onChange={handleThemeChange} />} label={darkMode ? <Brightness4Icon /> : <Brightness7Icon />} />
              <Button onClick={signOut} variant="outlined" size="small">Sign Out</Button>
            </Box>
          </Box>

          {currentView === 'admin' ? (
            <AdminDashboard /> 
          ) : (
            <>
               <TextField label="System Prompt (Optional)" variant="outlined" fullWidth size="small" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} sx={{ mb: 2, flexShrink: 0 }} />
               
               <Paper elevation={3} sx={{ flexGrow: 1, overflowY: 'auto', p: 2, mb: 2 }}>
                  <List>
                    {messages.map((msg, index) => (
                      <ListItem key={index} sx={{ alignItems: 'flex-start' }}>
                        <Avatar sx={{ bgcolor: msg.sender === 'user' ? 'primary.main' : 'secondary.main', mr: 2 }}>{msg.sender === 'user' ? <PersonIcon /> : <SmartToyIcon />}</Avatar>
                        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                          <ListItemText primary={msg.sender === 'user' ? `You (${userEmail ?? 'User'})` : 'AI'} secondary={<Typography component="div" variant="body2" sx={{ color: 'text.primary', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{msg.sender === 'ai' ? (<ReactMarkdown components={{ code: (props) => <CodeBlock {...props} darkMode={darkMode} /> }}>{msg.text || (isLoading && index === messages.length - 1 ? "..." : "")}</ReactMarkdown>) : (<span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>)}</Typography>} sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }} />
                          {msg.sender === 'ai' && msg.text && !isLoading && (<Box sx={{ alignSelf: 'flex-end', mt: 0.5 }}><IconButton size="small" onClick={() => handleCopyText(msg.text)} aria-label="copy response"><ContentCopyIcon fontSize="inherit" /></IconButton></Box>)}
                        </Box>
                      </ListItem>
                    ))}
                    <div ref={chatEndRef} />
                  </List>
               </Paper>
               {error && <Alert severity="error" sx={{ mb: 2, flexShrink: 0 }}>{error}</Alert>}
               
               <Box component="form" onSubmit={handleSubmit} sx={{ flexShrink: 0 }}>
                  <TextField label="Type your message..." variant="outlined" fullWidth value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={isLoading} multiline rows={2} maxRows={6} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FormControl variant="outlined" sx={{ minWidth: 150 }} size="small">
                        <InputLabel>Model</InputLabel>
                        <Select value={model} onChange={(e) => setModel(e.target.value as SupportedModel)} label="Model">
                          <MenuItem value="gpt-4o">GPT-4o</MenuItem><MenuItem value="gpt-4">GPT-4</MenuItem><MenuItem value="gemini-pro">Gemini Pro</MenuItem><MenuItem value="gemini-2.5-flash">Gemini Flash</MenuItem>
                        </Select>
                      </FormControl>

                      {/* --- Prompt Library Button --- */}
                      <Tooltip title="Browse Prompt Library">
                        <IconButton 
                          onClick={() => setIsLibraryOpen(true)} 
                          color="primary"
                          sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
                        >
                          <LibraryBooksIcon />
                        </IconButton>
                      </Tooltip>

                      {/* --- NEW: Voice Input Button --- */}
                      <Tooltip title={isListening ? "Listening..." : "Speak Input"}>
                        <IconButton 
                          onClick={handleVoiceInput} 
                          color={isListening ? "error" : "primary"}
                          sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, animation: isListening ? 'pulse 1.5s infinite' : 'none' }}
                        >
                          <MicIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    {isLoading ? (<Button variant="outlined" color="warning" onClick={handleStopGenerating} startIcon={<StopCircleIcon />}>Stop Generating</Button>) : (<Button type="submit" variant="contained" endIcon={<SendIcon />} disabled={!prompt.trim()}>Send</Button>)}
                  </Box>
               </Box>
            </>
          )}
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default withAuthenticator(App);