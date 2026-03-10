// src/App.tsx
import { useState, useRef, useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from '@aws-amplify/auth';
import { withAuthenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import awsExports from './aws-exports';
import { Toaster, toast } from 'react-hot-toast';

import { ThemeProvider } from '@mui/material/styles';
import customTheme from './theme';
import {
  Box, Container, CssBaseline, Paper, List, ListItem, Avatar,
  Typography, Alert, TextField, FormControl, Select, MenuItem,
  Button, IconButton, Tooltip, useMediaQuery, useTheme
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import DashboardIcon from '@mui/icons-material/Dashboard'; // Icon for admin
import ChatIcon from '@mui/icons-material/Chat'; // Icon for chat
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

const drawerWidth = 260; // Reduced from 280

// --- CONFIG ---
// REPLACE WITH YOUR ACTUAL EMAIL ADDRESSES
const ADMIN_EMAILS = ["your.email@example.com", "sudheer@markitome.com"];

type SupportedModel = 'gpt-4' | 'gemini-pro' | 'gemini-2.5-flash' | 'gpt-4o' | 'dall-e-3' | 'claude-4-6-sonnet' | 'llama-4-scout' | 'mistral-large';
interface Message { sender: 'user' | 'ai'; text: string; }
interface Conversation { id: string; title: string; }

// Add Web Speech API type definition
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
  // --- State Management ---
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

  // Dialog States
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Voice Input State
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
        setConversations(data.map((item: any) => ({
          id: item.id, title: item.title
        })));
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
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const windowObj = window as unknown as IWindow;
    const SpeechRecognition = windowObj.SpeechRecognition || windowObj.webkitSpeechRecognition;
    if (!SpeechRecognition) { toast.error("Browser doesn't support speech recognition."); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = false; recognition.interimResults = false; recognition.lang = 'en-US';
    recognition.onstart = () => { setIsListening(true); toast.success("Listening...", { id: 'voice-status' }); };
    recognition.onend = () => { setIsListening(false); toast.dismiss('voice-status'); };
    recognition.onresult = (event: any) => { const transcript = event.results[0][0].transcript; setPrompt((prev) => prev + (prev ? ' ' : '') + transcript); };
    recognition.onerror = (event: any) => { console.error("Speech recognition error", event.error); toast.error(`Speech error: ${event.error}`); setIsListening(false); };
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
    <ThemeProvider theme={customTheme}>
      <Toaster position="top-center" reverseOrder={false} toastOptions={{ duration: 3000, style: { background: '#333', color: '#fff' } }} />
      <CssBaseline />

      {/* --- Dialogs --- */}
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
            px: { xs: 2, md: 4 }, // Equal left and right padding
            boxSizing: 'border-box', flexGrow: 1,
            transition: 'all 0.3s ease',
            position: 'relative',
            width: '100%',
            mx: 'auto' // Center the chat content
          }}
        >
          {/* Header */}
          <Box sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
            mb: 3,
            p: 2,
            borderRadius: 2,
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)'
          }}>
            {/* Logo and Title */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
              {isMobile && currentView === 'chat' && (
                <IconButton
                  color="inherit"
                  aria-label="open drawer"
                  edge="start"
                  onClick={() => setMobileOpen(true)}
                  sx={{ mr: 1 }}
                >
                  <MenuIcon />
                </IconButton>
              )}
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <img 
                  src="/markitome-logo.png" 
                  alt="Markitome Logo" 
                  style={{ 
                    height: isMobile ? '32px' : '40px', 
                    width: 'auto',
                    objectFit: 'contain'
                  }} 
                />
                <Typography 
                  variant="caption" 
                  sx={{ 
                    color: 'text.secondary', 
                    fontWeight: 500,
                    fontSize: isMobile ? '0.65rem' : '0.75rem',
                    letterSpacing: '0.01em',
                    mt: 0.5,
                    display: { xs: 'none', sm: 'block' }
                  }}
                >
                  Your Intelligent Marketing Assistant
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
              {activeConversationId && currentView === 'chat' && (
                <Tooltip title="Share Chat">
                  <IconButton onClick={handleShareChat} size="small" sx={{ color: 'text.secondary' }}>
                    <ShareIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}

              <Tooltip title="Feedback">
                <IconButton onClick={() => setIsFeedbackOpen(true)} size="small" sx={{ color: 'text.secondary' }}>
                  <BugReportIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              {isAdmin && (
                <Button
                  size="small"
                  variant={currentView === 'admin' ? 'contained' : 'text'}
                  onClick={() => setCurrentView(prev => prev === 'chat' ? 'admin' : 'chat')}
                  startIcon={currentView === 'chat' ? <DashboardIcon /> : <ChatIcon />}
                  sx={{ borderRadius: '8px', mx: 1 }}
                >
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
              <TextField label="System Prompt (Optional)" variant="outlined" fullWidth size="small" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} sx={{ mb: 2, flexShrink: 0 }} />

              <Paper
                elevation={0}
                sx={{
                  flexGrow: 1,
                  overflowY: 'auto',
                  p: { xs: 1, md: 3 },
                  mb: 2,
                  bgcolor: '#ffffff',
                  border: '1px solid rgba(148, 163, 184, 0.4)',
                  borderRadius: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2
                }}
              >
                <List sx={{ p: 0 }}>
                  {messages.map((msg, index) => (
                    <ListItem
                      key={index}
                      className="message-appear"
                      sx={{
                        flexDirection: 'column',
                        alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                        px: 0,
                        py: 1,
                        mb: 1
                      }}
                    >
                      <Box sx={{
                        display: 'flex',
                        flexDirection: msg.sender === 'user' ? 'row-reverse' : 'row',
                        alignItems: 'flex-start',
                        gap: 1.5,
                        maxWidth: { xs: '90%', md: '80%' }
                      }}>
                        <Avatar
                          sx={{
                            width: 32,
                            height: 32,
                            bgcolor: msg.sender === 'user' ? 'primary.main' : 'background.paper',
                            border: '1px solid rgba(148, 163, 184, 0.1)',
                            fontSize: '0.875rem'
                          }}
                        >
                          {msg.sender === 'user' ? <PersonIcon fontSize="small" /> : <SmartToyIcon fontSize="small" />}
                        </Avatar>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                          <Paper
                            elevation={msg.sender === 'user' ? 3 : 0}
                            sx={{
                              p: 2,
                              borderRadius: msg.sender === 'user' ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
                              background: msg.sender === 'user'
                                ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
                                : 'background.paper',
                              color: msg.sender === 'user' ? 'white' : 'text.primary',
                              border: msg.sender === 'ai' ? '1px solid rgba(148, 163, 184, 0.1)' : 'none',
                              position: 'relative'
                            }}
                          >
                            <Typography component="div" variant="body2" sx={{ lineHeight: 1.6, color: msg.sender === 'user' ? 'white' : 'text.primary' }}>
                              {msg.sender === 'ai' ? (
                                <ReactMarkdown components={{ code: (props) => <CodeBlock {...props} /> }}>
                                  {msg.text || (isLoading && index === messages.length - 1 ? "..." : "")}
                                </ReactMarkdown>
                              ) : (
                                <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                              )}
                            </Typography>
                          </Paper>
                          
                          {msg.sender === 'ai' && msg.text && !isLoading && (
                            <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5 }}>
                              <Tooltip title="View Artifact">
                                <IconButton size="small" onClick={() => setActiveArtifact(msg.text)} sx={{ color: 'text.secondary', opacity: 0.6, '&:hover': { opacity: 1 } }}>
                                  <VerticalSplitIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Copy">
                                <IconButton size="small" onClick={() => handleCopyText(msg.text)} sx={{ color: 'text.secondary', opacity: 0.6, '&:hover': { opacity: 1 } }}>
                                  <ContentCopyIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          )}
                        </Box>
                      </Box>
                    </ListItem>
                  ))}
                  <div ref={chatEndRef} />
                </List>
              </Paper>
              {error && <Alert severity="error" sx={{ mb: 2, flexShrink: 0 }}>{error}</Alert>}

              <Box
                component="form"
                onSubmit={handleSubmit}
                sx={{
                  flexShrink: 0,
                  p: 2,
                  borderRadius: 4,
                  bgcolor: 'background.paper',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
                }}
              >
                <TextField
                  placeholder={model === 'dall-e-3' ? "Describe the image..." : "Start your next campaign or type a command..."}
                  variant="standard"
                  fullWidth
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={isLoading}
                  multiline
                  maxRows={6}
                  InputProps={{
                    disableUnderline: true,
                    sx: { fontSize: '1rem', px: 1, py: 1, color: 'text.primary' }
                  }}
                />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FormControl variant="outlined" size="small" sx={{ 
                      '& .MuiOutlinedInput-root': { 
                        bgcolor: 'transparent', 
                        border: 'none',
                        '& fieldset': { border: 'none' } 
                      } 
                    }}>
                      <Select
                        value={model}
                        onChange={(e) => setModel(e.target.value as SupportedModel)}
                        sx={{ fontSize: '0.875rem', color: 'text.secondary' }}
                        MenuProps={{
                          PaperProps: {
                            sx: { bgcolor: 'background.paper', border: '1px solid rgba(148, 163, 184, 0.2)' }
                          }
                        }}
                      >
                        <MenuItem value="gpt-4o">GPT-4o</MenuItem>
                        <MenuItem value="claude-4-6-sonnet">Claude 3.5</MenuItem>
                        <MenuItem value="gemini-2.5-flash">Gemini Flash</MenuItem>
                        <MenuItem value="llama-4-scout">Llama 3</MenuItem>
                      </Select>
                    </FormControl>
                    <Tooltip title="Prompt Library">
                      <IconButton onClick={() => setIsLibraryOpen(true)} size="small" sx={{ color: 'text.secondary' }}>
                        <LibraryBooksIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={isListening ? "Listening..." : "Voice Input"}>
                      <IconButton
                        onClick={handleVoiceInput}
                        size="small"
                        sx={{
                          color: isListening ? 'error.main' : 'text.secondary',
                          animation: isListening ? 'pulse 1.5s infinite' : 'none'
                        }}
                      >
                        <MicIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Box>
                    {isLoading ? (
                      <IconButton onClick={handleStopGenerating} color="warning">
                        <StopCircleIcon />
                      </IconButton>
                    ) : (
                      <IconButton
                        type="submit"
                        disabled={!prompt.trim()}
                        sx={{
                          bgcolor: 'primary.main',
                          color: 'white',
                          '&:hover': { bgcolor: 'primary.dark' },
                          '&.Mui-disabled': { bgcolor: 'rgba(148, 163, 184, 0.1)', color: 'rgba(148, 163, 184, 0.3)' }
                        }}
                      >
                        <SendIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                </Box>
              </Box>
            </>
          )}
        </Container>

        <ArtifactPanel
          content={activeArtifact || ''}
          isOpen={!!activeArtifact}
          onClose={() => setActiveArtifact(null)}
          darkMode={false}
          isMobile={isMobile}
        />
      </Box>
    </ThemeProvider>
  );
}

// --- CUSTOMIZE AUTHENTICATOR HEADER ---
const components = {
  Header() {
    return (
      <>
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <img
            src="/markitome-logo.png"
            alt="Markitome Logo"
            style={{ width: '120px', height: 'auto', marginBottom: '10px' }}
          />
          <Typography variant="h5" sx={{ fontWeight: 600, color: '#333' }}>
            Markitome AI
          </Typography>
          <Typography variant="body2" sx={{ color: '#666' }}>
            Your Intelligent Marketing Assistant
          </Typography>
        </div>
      </>
    );
  }
};

export default withAuthenticator(App, { components });