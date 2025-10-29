// src/App.tsx
import { useState, useRef, useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from '@aws-amplify/auth';
import { withAuthenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import awsExports from './aws-exports';

import { ThemeProvider, createTheme } from '@mui/material/styles';
import {
  Box, Container, CssBaseline, Paper, List, ListItem, Avatar, ListItemText,
  Typography, Alert, TextField, FormControl, InputLabel, Select, MenuItem,
  Button, CircularProgress, Switch, FormControlLabel
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';

import { ConversationSidebar } from './ConversationSidebar';

import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import materialDark from 'react-syntax-highlighter/dist/cjs/styles/prism/material-dark';
import materialLight from 'react-syntax-highlighter/dist/cjs/styles/prism/material-light';

Amplify.configure(awsExports);

// --- Define drawerWidth (FIX 1) ---
const drawerWidth = 280;

// --- Type Definitions ---
type SupportedModel = 'gpt-4' | 'gemini-pro' | 'gemini-2.5-flash' | 'gpt-4o';
interface Message {
  sender: 'user' | 'ai';
  text: string;
}
interface Conversation {
  id: string;
  title: string;
}

// --- Custom Component for Code Highlighting ---
const CodeBlock = ({ node, inline, className, children, darkMode, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    return !inline && match ? (
        <SyntaxHighlighter
            style={darkMode ? materialDark : materialLight}
            language={match[1]}
            PreTag="div"
            {...props}
        >
            {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
    ) : (
        <code className={className} {...props}>
            {children}
        </code>
    );
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

  // --- Theme & API Configuration ---
  const lightTheme = createTheme({ palette: { mode: 'light' } });
  const darkTheme = createTheme({ palette: { mode: 'dark' } });
  const handleThemeChange = () => setDarkMode(!darkMode);

  const CONVERSATIONS_URL = '/api/conversations';
  const GENERATE_URL = '/api/generate';

  // --- Helper Function ---
  const getAuthToken = async () => {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();
    if (!idToken) throw new Error("User is not authenticated.");
    return idToken;
  };

  // --- Effects ---
  useEffect(() => {
    const loadConversations = async () => {
      setError('');
      try {
        const token = await getAuthToken();
        const res = await fetch(CONVERSATIONS_URL, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.detail || "Failed to fetch conversations from server");
        }
        const data = await res.json();
        setConversations(data);
      } catch (err: any) {
        setError(`Failed to load conversations: ${err.message}`);
      }
    };
    loadConversations();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Event Handlers ---
  const handleSelectConversation = async (id: string) => {
    setActiveConversationId(id);
    setMessages([]);
    setError('');
    setIsLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${CONVERSATIONS_URL}/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.detail || "Failed to fetch messages");
      }
      const data = await res.json();
      const sortedMessages = data.sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp));
      setMessages(sortedMessages.map((msg: any) => ({ sender: msg.sender, text: msg.text })));
    } catch (err: any) {
      setError(`Failed to load messages: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
    setPrompt('');
    setError('');
  };

  const handleDeleteConversation = async (id: string) => {
    setError('');
    try {
      const token = await getAuthToken();
      const response = await fetch(`${CONVERSATIONS_URL}/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete conversation');
      }
      setConversations(prev => prev.filter(conv => conv.id !== id));
      if (activeConversationId === id) {
        handleNewConversation();
      }
    } catch (error) {
      setError(`Deletion failed: ${(error as Error).message}`);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Removed image check, ensure prompt exists
    if (!prompt.trim() || isLoading) return; 

    const userMessage: Message = { sender: 'user', text: prompt };
    const currentPrompt = prompt;
    const currentHistory = [...messages];

    // Add user message immediately (Optimistic UI)
    setMessages(prev => [...prev, userMessage]); 
    setPrompt('');
    setIsLoading(true);
    setError('');

    try {
        const token = await getAuthToken();
        const historyForApi = currentHistory.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            content: msg.text
        }));

        // Standard fetch, expects a single JSON response
        const res = await fetch(GENERATE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                prompt: currentPrompt,
                model,
                conversationId: activeConversationId,
                history: historyForApi,
                // image: null // Image removed
            }),
        });

        // Check for HTTP errors first
        if (!res.ok) {
            // Try to parse error JSON, fallback to status text
            let errorDetail = `Server error: ${res.status}`;
            try {
                const errorData = await res.json();
                errorDetail = errorData.detail || errorDetail;
            } catch (parseError) {
                // Ignore if error response wasn't JSON
            }
            throw new Error(errorDetail);
        }

        // --- Wait for the FULL JSON response ---
        const data = await res.json(); 
        // ------------------------------------

        const aiMessage: Message = { sender: 'ai', text: data.text };

        // Add the complete AI message once received
        setMessages(prev => [...prev, aiMessage]); 

        // If it was a new conversation, update sidebar
        if (!activeConversationId && data.conversationId) {
            const newConvId = data.conversationId;
            setActiveConversationId(newConvId);
            setConversations(prev => [{ id: newConvId, title: currentPrompt.substring(0, 50) }, ...prev]);
        }

    } catch (err: any) {
        setError(err.message);
        // Remove the optimistic user message if the request fails
        setMessages(prev => prev.slice(0, -1)); 
    } finally {
        setIsLoading(false);
    }
  };

  // --- JSX Rendering ---
  return (
    <ThemeProvider theme={darkMode ? darkTheme : lightTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <ConversationSidebar
          conversations={conversations}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
          activeConversationId={activeConversationId}
        />
        {/* Use the defined drawerWidth constant here (FIX 1) */}
        <Container
          maxWidth={false}
          sx={{ display: 'flex', flexDirection: 'column', height: '100%', pt: 2, pb: 2, boxSizing: 'border-box', flexGrow: 1, ml: `${drawerWidth}px` }}
        >
          {/* Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <Typography variant="h4" component="h1" gutterBottom noWrap>Markitome AI</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <FormControlLabel
                control={<Switch checked={darkMode} onChange={handleThemeChange} />}
                label={darkMode ? <Brightness4Icon /> : <Brightness7Icon />}
              />
              <Button onClick={signOut} variant="outlined" size="small">Sign Out</Button>
            </Box>
          </Box>

          {/* Chat History Area */}
          <Paper elevation={3} sx={{ flexGrow: 1, overflowY: 'auto', p: 2, mb: 2 }}>
            <List>
              {messages.map((msg, index) => (
                <ListItem key={index} sx={{ alignItems: 'flex-start' }}>
                  <Avatar sx={{ bgcolor: msg.sender === 'user' ? 'primary.main' : 'secondary.main', mr: 2 }}>
                    {msg.sender === 'user' ? <PersonIcon /> : <SmartToyIcon />}
                  </Avatar>
                  <ListItemText
                    // Provide fallback if email is undefined (FIX 2)
                    primary={msg.sender === 'user' ? `You (${user?.attributes?.email ?? 'User'})` : 'AI'}
                    secondary={
                      <Typography component="div" variant="body2" sx={{ color: 'text.primary', overflowWrap: 'break-word' }}>
                        {msg.sender === 'ai' ? (
                          <ReactMarkdown components={{ code: (props) => <CodeBlock {...props} darkMode={darkMode} /> }}>
                            {msg.text || "..."}
                          </ReactMarkdown>
                        ) : (
                          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                        )}
                      </Typography>
                    }
                  />
                </ListItem>
              ))}
              <div ref={chatEndRef} />
            </List>
          </Paper>

          {/* Error Display Area */}
          {error && <Alert severity="error" sx={{ mb: 2, flexShrink: 0 }}>{error}</Alert>}

          {/* Input Form Area */}
          <Box component="form" onSubmit={handleSubmit} sx={{ flexShrink: 0 }}>
            <TextField
              label="Type your message..."
              variant="outlined"
              fullWidth
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isLoading}
              multiline
              rows={2}
              maxRows={6}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <FormControl variant="outlined" sx={{ minWidth: 150 }} size="small">
                  <InputLabel>Model</InputLabel>
                  <Select value={model} onChange={(e) => setModel(e.target.value as SupportedModel)} label="Model">
                    <MenuItem value="gpt-4o">GPT-4o</MenuItem>
                    <MenuItem value="gpt-4">GPT-4</MenuItem>
                    <MenuItem value="gemini-pro">Gemini Pro</MenuItem>
                    <MenuItem value="gemini-2.5-flash">Gemini Flash</MenuItem>
                  </Select>
                </FormControl>
                {/* Image upload button removed */}
              </Box>
              <Button type="submit" variant="contained" endIcon={isLoading ? null : <SendIcon />} disabled={isLoading}>
                {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Send'}
              </Button>
            </Box>
          </Box>
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default withAuthenticator(App);