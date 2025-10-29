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

const drawerWidth = 280; // Define sidebar width

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
  // Load conversations on initial mount, prioritize custom title
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
        // Map data prioritizing explicit 'title' attribute if it exists from rename
        setConversations(data.map((item: any) => ({
            id: item.conversationId || item.id, // Handle potential key differences
            // Use item.title if present (from rename), otherwise fallback to item.text
            title: item.title || item.text?.substring(0, 50) || 'New Chat'
        })));
      } catch (err: any) {
        setError(`Failed to load conversations: ${err.message}`);
      }
    };
    loadConversations();
  }, []); // Run once on mount

  // Scroll to bottom when messages change
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

  const handleRenameConversation = async (id: string, newTitle: string): Promise<Conversation> => {
    setError('');
    try {
      const token = await getAuthToken();
      const response = await fetch(`${CONVERSATIONS_URL}/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ new_title: newTitle })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to rename conversation');
      }
      const updatedConversation = await response.json();

      // Update the conversation list in the local state
      setConversations(prev =>
        prev.map(conv =>
          conv.id === id ? { ...conv, title: updatedConversation.title } : conv
        )
      );
      return updatedConversation;

    } catch (error) {
      setError(`Rename failed: ${(error as Error).message}`);
      throw error;
    }
  };

  // --- Non-Streaming Submit Handler ---
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;

    const userMessage: Message = { sender: 'user', text: prompt };
    const currentPrompt = prompt;
    const currentHistory = [...messages];

    setMessages(prev => [...prev, userMessage]); // Add user message optimistically
    setPrompt('');
    setIsLoading(true);
    setError('');

    try {
        const token = await getAuthToken();
        const historyForApi = currentHistory.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            content: msg.text
        }));

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
                // image: null // Image field removed
            }),
        });

        if (!res.ok) {
            let errorDetail = `Server error: ${res.status}`;
            try { const errorData = await res.json(); errorDetail = errorData.detail || errorDetail; } catch (e) {}
            throw new Error(errorDetail);
        }

        const data = await res.json(); // Wait for full JSON response

        const aiMessage: Message = { sender: 'ai', text: data.text };
        setMessages(prev => [...prev, aiMessage]); // Add AI response

        if (!activeConversationId && data.conversationId) {
            const newConvId = data.conversationId;
            setActiveConversationId(newConvId);
            setConversations(prev => [{ id: newConvId, title: currentPrompt.substring(0, 50) }, ...prev]);
        }

    } catch (err: any) {
        setError(err.message);
        setMessages(prev => prev.slice(0, -1)); // Remove optimistic user message on error
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
          onRenameConversation={handleRenameConversation} // Pass rename handler
          activeConversationId={activeConversationId}
        />
        <Container
          maxWidth={false}
          sx={{ display: 'flex', flexDirection: 'column', height: '100%', pt: 2, pb: 2, boxSizing: 'border-box', flexGrow: 1, ml: `${drawerWidth}px` }}
        >
          {/* Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <Typography variant="h4" component="h1" gutterBottom noWrap>AI Chat</Typography>
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
                    primary={msg.sender === 'user' ? `You (${user?.attributes?.email ?? 'User'})` : 'AI'}
                    secondary={
                      <Typography component="div" variant="body2" sx={{ color: 'text.primary', overflowWrap: 'break-word' }}>
                        {msg.sender === 'ai' ? (
                          <ReactMarkdown components={{ code: (props) => <CodeBlock {...props} darkMode={darkMode} /> }}>
                            {msg.text || (isLoading && index === messages.length -1 ? "..." : "")} {/* Show placeholder only for the last AI msg while loading */}
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