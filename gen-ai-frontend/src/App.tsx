// src/App.tsx
import { useState, useRef, useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from '@aws-amplify/auth';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { useLocation } from 'react-router-dom';
import awsExports from './aws-exports';
import { Toaster, toast } from 'react-hot-toast';

import { ThemeProvider } from '@mui/material/styles';
import customTheme from './theme';
import {
  Box, Container, CssBaseline, Paper, List, ListItem, Avatar,
  Typography, Alert, TextField, Select, MenuItem,
  Button, IconButton, Tooltip, useMediaQuery, useTheme
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import ShareIcon from '@mui/icons-material/Share'; // Icon for share
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks'; // Icon for library
import MicIcon from '@mui/icons-material/Mic'; // Icon for voice
import VerticalSplitIcon from '@mui/icons-material/VerticalSplit'; // Icon for artifact panel
import BugReportIcon from '@mui/icons-material/BugReport'; // Icon for feedback
import { ContentCopy as ContentCopyIcon } from '@mui/icons-material';

import { ConversationSidebar } from './ConversationSidebar';
import { AdminDashboard } from './AdminDashboard';
import { PromptLibrary } from './PromptLibrary';
import { ArtifactPanel } from './ArtifactPanel';
import { FeedbackDialog } from './FeedbackDialog';

import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import materialLight from 'react-syntax-highlighter/dist/cjs/styles/prism/material-light';

Amplify.configure(awsExports);

// --- CONFIG ---
const ADMIN_EMAILS = ["your.email@example.com", "sudheer@markitome.com"];

type SupportedModel = 'gpt-4' | 'gemini-pro' | 'gemini-2.5-flash' | 'gpt-4o' | 'dall-e-3' | 'claude-4-6-sonnet' | 'llama-4-scout' | 'mistral-large';
interface Message { sender: 'user' | 'ai'; text: string; }
interface Conversation { id: string; title: string; }

interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

const CodeBlock = ({ node, inline, className, children, ...props }: any) => {
  const match = /language-(\w+)/.exec(className || '');
  return !inline && match ? (
    <SyntaxHighlighter style={materialLight} language={match[1]} PreTag="div" {...props}>
      {String(children).replace(/\n$/, '')}
    </SyntaxHighlighter>
  ) : (<code className={className} {...props}>{children}</code>);
};

function App({ signOut, user }: { signOut?: () => void; user?: any }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState<string>('');
  const [model, setModel] = useState<SupportedModel>('gpt-4o');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const chatEndRef = useRef<null | HTMLDivElement>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [currentView, setCurrentView] = useState<'chat' | 'admin'>('chat');

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

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
        setConversations(data.map((item: any) => ({ id: item.id, title: item.title })));
      } catch (err: any) { setError(`Failed to load conversations: ${err.message}`); }
    };
    loadConversations();
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSelectConversation = async (id: string) => {
    setActiveConversationId(id);
    setMessages([]);
    setError('');
    setIsLoading(true);
    setActiveArtifact(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${CONVERSATIONS_URL}/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) { const errorData = await res.json(); throw new Error(errorData.detail || "Failed to fetch messages"); }
      const data = await res.json();
      const sortedMessages = data.sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp));
      setMessages(sortedMessages.map((msg: any) => ({ sender: msg.sender, text: msg.text })));
      if (isMobile) setMobileOpen(false);
    } catch (err: any) { setError(`Failed to load messages: ${err.message}`); } finally { setIsLoading(false); }
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
    setPrompt('');
    setError('');
    setActiveArtifact(null);
  };

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
    if (abortController) { abortController.abort(); setAbortController(null); setIsLoading(false); toast.error("Generation stopped by user."); }
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
      const fullUrl = `${window.location.origin}/share/${data.shareId}`;
      await navigator.clipboard.writeText(fullUrl);
      toast.success("Link copied to clipboard!");
    } catch (err) { console.error(err); toast.error("Failed to generate share link."); }
  };

  const handleSelectPrompt = (newPrompt: string) => {
    setPrompt(newPrompt);
    setIsLibraryOpen(false);
  };

  const handleVoiceInput = () => {
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const windowObj = window as unknown as IWindow;
    const SpeechRecognition = windowObj.SpeechRecognition || windowObj.webkitSpeechRecognition;
    if (!SpeechRecognition) { toast.error("Browser doesn't support speech recognition."); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = false; recognition.interimResults = false; recognition.lang = 'en-US';
    recognition.onstart = () => { setIsListening(true); toast.success("Listening...", { id: 'voice-status' }); };
    recognition.onend = () => { setIsListening(false); toast.dismiss('voice-status'); };
    recognition.onresult = (event: any) => { const transcript = event.results[0][0].transcript; setPrompt((prev) => prev + (prev ? ' ' : '') + transcript); };
    recognition.onerror = (event: any) => { console.error("Speech recognition error", event.error); setIsListening(false); };
    recognitionRef.current = recognition; recognition.start();
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
      const formData = new FormData();
      formData.append('prompt', currentPrompt);
      formData.append('model', model);
      if (activeConversationId) formData.append('conversationId', activeConversationId);
      if (systemPrompt) formData.append('systemPrompt', systemPrompt);
      formData.append('history', JSON.stringify(historyForApi));

      const res = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      if (!res.ok) { let errorDetail = `Server error: ${res.status}`; try { const errorData = await res.json(); errorDetail = errorData.detail || errorDetail; } catch (e) { } throw new Error(errorDetail); }
      const data = await res.json();
      const aiMessage: Message = { sender: 'ai', text: data.text };
      setMessages(prev => [...prev, aiMessage]);
      if (!activeConversationId && data.conversationId) { const newConvId = data.conversationId; setActiveConversationId(newConvId); setConversations(prev => [{ id: newConvId, title: currentPrompt.substring(0, 50) }, ...prev]); }
    } catch (err: any) { if (err.name === 'AbortError') { console.log('Fetch aborted'); } else { setError(err.message); } } finally { setIsLoading(false); setAbortController(null); }
  };

  const userEmail = user?.signInDetails?.loginId || user?.attributes?.email;
  const isAdmin = userEmail && ADMIN_EMAILS.includes(userEmail);

  return (
    <ThemeProvider theme={customTheme}>
      <Toaster position="top-center" reverseOrder={false} toastOptions={{ duration: 3000, style: { background: '#333', color: '#fff' } }} />
      <CssBaseline />

      <PromptLibrary open={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} onSelectPrompt={handleSelectPrompt} isMobile={isMobile} />
      <FeedbackDialog open={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} isMobile={isMobile} />

      <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        {currentView === 'chat' && (
          <ConversationSidebar
            conversations={conversations}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            onDeleteConversation={handleDeleteConversation}
            onRenameConversation={handleRenameConversation}
            activeConversationId={activeConversationId}
            isMobile={isMobile}
            mobileOpen={mobileOpen}
            onClose={() => setMobileOpen(false)}
          />
        )}

        <Container
          maxWidth="md"
          sx={{
            display: 'flex', flexDirection: 'column', height: '100%',
            pt: { xs: 1, md: 3 }, pb: { xs: 1, md: 3 }, 
            px: { xs: 2, md: 4 }, mx: 'auto', flexGrow: 1, position: 'relative'
          }}
        >
          {/* Header */}
          <Box sx={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
            mb: 3, p: 2, borderRadius: 2, bgcolor: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(148, 163, 184, 0.2)', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
              {isMobile && currentView === 'chat' && (
                <IconButton color="inherit" aria-label="open drawer" edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}>
                  <MenuIcon />
                </IconButton>
              )}
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <img src="/markitome-logo.png" alt="Markitome Logo" style={{ height: isMobile ? '32px' : '40px', width: 'auto' }} />
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: isMobile ? '0.65rem' : '0.75rem', display: { xs: 'none', sm: 'block' } }}>
                  Your Intelligent Marketing Assistant
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {activeConversationId && currentView === 'chat' && (
                <Tooltip title="Share Chat"><IconButton onClick={handleShareChat} size="small"><ShareIcon fontSize="small" /></IconButton></Tooltip>
              )}
              <Tooltip title="Feedback"><IconButton onClick={() => setIsFeedbackOpen(true)} size="small"><BugReportIcon fontSize="small" /></IconButton></Tooltip>
              {isAdmin && (
                <Button size="small" variant={currentView === 'admin' ? 'contained' : 'text'} onClick={() => setCurrentView(v => v === 'chat' ? 'admin' : 'chat')}>
                  {currentView === 'chat' ? 'Admin' : 'Chat'}
                </Button>
              )}
              <Button onClick={signOut} variant="text" size="small" sx={{ color: 'text.secondary' }}>Sign Out</Button>
            </Box>
          </Box>

          {currentView === 'admin' ? (
            <AdminDashboard />
          ) : (
            <>
              <TextField label="System Prompt (Optional)" variant="outlined" fullWidth size="small" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} sx={{ mb: 2 }} />
              <Paper elevation={0} sx={{ flexGrow: 1, overflowY: 'auto', p: { xs: 1, md: 3 }, mb: 2, bgcolor: '#ffffff', border: '1px solid rgba(148, 163, 184, 0.4)', borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <List sx={{ p: 0 }}>
                  {messages.map((msg, index) => (
                    <ListItem key={index} sx={{ flexDirection: 'column', alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start', px: 0, py: 1 }}>
                      <Box sx={{ display: 'flex', flexDirection: msg.sender === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-start', gap: 1.5, maxWidth: '85%' }}>
                        <Avatar sx={{ width: 32, height: 32, bgcolor: msg.sender === 'user' ? 'primary.main' : 'background.paper', border: '1px solid rgba(0,0,0,0.05)' }}>
                          {msg.sender === 'user' ? <PersonIcon fontSize="small" /> : <SmartToyIcon fontSize="small" />}
                        </Avatar>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                          <Paper sx={{ p: 2, borderRadius: msg.sender === 'user' ? '18px 4px 18px 18px' : '4px 18px 18px 18px', bgcolor: msg.sender === 'user' ? 'primary.main' : '#f8fafc', color: msg.sender === 'user' ? 'white' : 'text.primary' }}>
                            <Typography component="div" variant="body2" sx={{ lineHeight: 1.6 }}>
                              {msg.sender === 'ai' ? <ReactMarkdown components={{ code: (props) => <CodeBlock {...props} /> }}>{msg.text}</ReactMarkdown> : msg.text}
                            </Typography>
                          </Paper>
                          {msg.sender === 'ai' && msg.text && !isLoading && (
                            <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5 }}>
                              <IconButton size="small" onClick={() => setActiveArtifact(msg.text)}><VerticalSplitIcon sx={{ fontSize: 16 }} /></IconButton>
                              <IconButton size="small" onClick={() => handleCopyText(msg.text)}><ContentCopyIcon sx={{ fontSize: 16 }} /></IconButton>
                            </Box>
                          )}
                        </Box>
                      </Box>
                    </ListItem>
                  ))}
                  <div ref={chatEndRef} />
                </List>
              </Paper>
              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
              <Box component="form" onSubmit={handleSubmit} sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 4, border: '1px solid rgba(0,0,0,0.1)' }}>
                <TextField placeholder="Message Markitome..." fullWidth multiline maxRows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} InputProps={{ disableUnderline: true, sx: { px: 1, py: 1 } }} variant="standard" />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Select size="small" value={model} onChange={(e) => setModel(e.target.value as SupportedModel)} sx={{ fontSize: '0.8rem' }}>
                      <MenuItem value="gpt-4o">GPT-4o</MenuItem>
                      <MenuItem value="claude-4-6-sonnet">Claude 3.5</MenuItem>
                      <MenuItem value="gemini-2.5-flash">Gemini Flash</MenuItem>
                      <MenuItem value="llama-4-scout">Llama 3</MenuItem>
                    </Select>
                    <IconButton onClick={() => setIsLibraryOpen(true)} size="small"><LibraryBooksIcon fontSize="small" /></IconButton>
                    <IconButton onClick={handleVoiceInput} size="small" color={isListening ? 'error' : 'default'}><MicIcon fontSize="small" /></IconButton>
                  </Box>
                  {isLoading ? (
                    <IconButton onClick={handleStopGenerating} color="warning"><StopCircleIcon /></IconButton>
                  ) : (
                    <IconButton type="submit" disabled={!prompt.trim()} sx={{ bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } }}><SendIcon fontSize="small" /></IconButton>
                  )}
                </Box>
              </Box>
            </>
          )}
        </Container>

        <ArtifactPanel content={activeArtifact || ''} isOpen={!!activeArtifact} onClose={() => setActiveArtifact(null)} darkMode={false} isMobile={isMobile} />
      </Box>
    </ThemeProvider>
  );
}

const components = {
  Header() {
    return (
      <Box sx={{ textAlign: 'center', p: 4 }}>
        <img src="/markitome-logo.png" alt="Markitome" style={{ width: '120px', height: 'auto' }} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Your Intelligent Marketing Assistant</Typography>
      </Box>
    );
  }
};

const AuthWrapper = () => {
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const mode = query.get('mode') === 'signup' ? 'signUp' : 'signIn';
  return (
    <Authenticator initialState={mode} components={components}>
      {({ signOut, user }) => <App signOut={signOut} user={user} />}
    </Authenticator>
  );
};

export default AuthWrapper;