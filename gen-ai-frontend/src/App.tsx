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

import { ConversationSidebar } from './ConversationSidebar'; // Assuming this file is updated to remove upload button

import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import materialDark from 'react-syntax-highlighter/dist/cjs/styles/prism/material-dark';
import materialLight from 'react-syntax-highlighter/dist/cjs/styles/prism/material-light';

Amplify.configure(awsExports);

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
  const [model, setModel] = useState<SupportedModel>('gpt-4o'); // Default model
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
  // Load conversations on initial mount
  useEffect(() => {
    const loadConversations = async () => {
      setError(''); // Clear previous errors
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
  }, []); // Empty dependency array means run once on mount

  // Scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Event Handlers ---
  const handleSelectConversation = async (id: string) => {
    setActiveConversationId(id);
    setMessages([]); // Clear current messages
    setError('');
    setIsLoading(true); // Show loading while fetching history
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
      setIsLoading(false); // Hide loading indicator
    }
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
    setPrompt('');
    setError(''); // Clear errors on new chat
  };

  const handleDeleteConversation = async (id: string) => {
    setError(''); // Clear previous errors
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
      // Remove the conversation from the local state
      setConversations(prev => prev.filter(conv => conv.id !== id));
      // If the deleted conversation was active, switch to new chat state
      if (activeConversationId === id) {
        handleNewConversation();
      }
    } catch (error) {
      setError(`Deletion failed: ${(error as Error).message}`);
      throw error; // Re-throw so sidebar can potentially show status
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return; // Only need prompt now

    const userMessage: Message = { sender: 'user', text: prompt };
    const currentPrompt = prompt;
    const currentHistory = [...messages]; // History before adding the new message

    // Add user message and AI placeholder immediately
    setMessages(prev => [...prev, userMessage, { sender: 'ai', text: '' }]);
    setPrompt(''); // Clear input field
    setIsLoading(true);
    setError('');

    try {
        const token = await getAuthToken();
        const historyForApi = currentHistory.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model', // Use 'model' for AI role
            content: msg.text
        }));

        // Call the backend API
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
                // image: null // Explicitly removed image field
            }),
        });

        if (!res.ok) {
            // Handle non-streaming errors from the initial request
            const errorData = await res.json();
            throw new Error(errorData.detail || `Server error: ${res.status}`);
        }

        if (!res.body) {
            throw new Error("Response body is empty.");
        }

        // --- Start processing the stream ---
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let leftover = ''; // Buffer for incomplete SSE messages

        while (true) {
            const { done, value } = await reader.read();
            if (done) break; // Exit loop when stream is finished

            const chunk = leftover + decoder.decode(value, { stream: true });
            const lines = chunk.split('\n\n'); // SSE messages are separated by double newlines
            leftover = lines.pop() || ''; // Buffer the last potentially incomplete line

            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const jsonStr = line.replace('data: ', '');
                    try {
                        const parsed = JSON.parse(jsonStr);
                        if (parsed.text) {
                            // Append received text chunk using functional update
                            setMessages(prevMessages => {
                                const updatedMessages = [...prevMessages];
                                const lastMessage = updatedMessages[updatedMessages.length - 1];
                                // Ensure we're updating the AI's message
                                if (lastMessage && lastMessage.sender === 'ai') {
                                    updatedMessages[updatedMessages.length - 1] = {
                                        ...lastMessage,
                                        text: lastMessage.text + parsed.text,
                                    };
                                }
                                return updatedMessages;
                            });
                        } else if (parsed.event === 'done') {
                            // If it was a new conversation, update the sidebar
                            if (!activeConversationId) {
                                const newConvId = parsed.conversationId;
                                setActiveConversationId(newConvId);
                                // Add new conversation to the top of the list
                                setConversations(prev => [{ id: newConvId, title: currentPrompt.substring(0, 50) }, ...prev]);
                            }
                            // Stream finished normally
                        } else if (parsed.error) {
                            // Handle errors sent explicitly in the stream
                            setError(parsed.error);
                        }
                    } catch (e) {
                        console.error("Failed to parse JSON chunk:", jsonStr, e);
                        setError("Received malformed data from server.");
                    }
                }
            }
        }
        // --- End of stream processing ---

    } catch (err: any) {
        setError(err.message);
        // Clean up the optimistic UI updates (user msg + AI placeholder) if the request fails
        setMessages(prev => prev.slice(0, -2));
    } finally {
        setIsLoading(false); // Ensure loading indicator stops
    }
  };

  // --- JSX Rendering ---
  return (
    <ThemeProvider theme={darkMode ? darkTheme : lightTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}> {/* Prevent body scroll */}
        <ConversationSidebar
          conversations={conversations}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation} // Pass delete handler
          activeConversationId={activeConversationId}
        />
        <Container
          maxWidth={false} // Disable maxWidth to fill space
          sx={{ display: 'flex', flexDirection: 'column', height: '100%', pt: 2, pb: 2, boxSizing: 'border-box', flexGrow: 1, ml: `${drawerWidth}px` }} // Use variable width
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
                    primary={msg.sender === 'user' ? `You (${user?.attributes?.email})` : 'AI'}
                    secondary={
                      <Typography component="div" variant="body2" sx={{ color: 'text.primary', overflowWrap: 'break-word' }}>
                        {msg.sender === 'ai' ? (
                          <ReactMarkdown components={{ code: (props) => <CodeBlock {...props} darkMode={darkMode} /> }}>
                            {msg.text || "..."} {/* Show placeholder if text is empty */}
                          </ReactMarkdown>
                        ) : (
                          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                        )}
                      </Typography>
                    }
                  />
                </ListItem>
              ))}
              {/* Dummy div for auto-scrolling */}
              <div ref={chatEndRef} />
            </List>
          </Paper>

          {/* Error Display Area */}
          {error && <Alert severity="error" sx={{ mb: 2, flexShrink: 0 }}>{error}</Alert>}

          {/* Input Form Area */}
          <Box component="form" onSubmit={handleSubmit} sx={{ flexShrink: 0 }}>
            <TextField
              label="Type your message..." // Simplified label
              variant="outlined"
              fullWidth
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isLoading}
              multiline // Allow multiline input
              rows={2} // Start with 2 rows
              maxRows={6} // Allow expansion up to 6 rows
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