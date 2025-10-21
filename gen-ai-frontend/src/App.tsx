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
  Button, CircularProgress, Switch, FormControlLabel, IconButton
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import ImageIcon from '@mui/icons-material/Image';
import CloseIcon from '@mui/icons-material/Close';

import { ConversationSidebar } from './ConversationSidebar';

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
  const [model, setModel] = useState<SupportedModel>('gpt-4o');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [darkMode, setDarkMode] = useState(false);
  const [image, setImage] = useState<string | null>(null); // State for Base64 image
  const imageInputRef = useRef<HTMLInputElement>(null);
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
      try {
        const token = await getAuthToken();
        const res = await fetch(CONVERSATIONS_URL, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error("Failed to fetch conversations from server");
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
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectConversation = async (id: string) => {
    setActiveConversationId(id);
    setMessages([]);
    setError('');
    setIsLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${CONVERSATIONS_URL}/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to fetch messages");
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
    setImage(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if ((!prompt.trim() && !image) || isLoading) return;

    const userMessageText = prompt.trim() || (image ? "What's in this image?" : "");
    const userMessage: Message = { sender: 'user', text: userMessageText };
    const currentPrompt = prompt;
    const currentHistory = [...messages];

    setMessages(prev => [...prev, userMessage, { sender: 'ai', text: '' }]);
    setPrompt('');
    setImage(null); // Clear image after submission
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
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                prompt: currentPrompt,
                model,
                conversationId: activeConversationId,
                history: historyForApi,
                image: image // Send the Base64 image string
            }),
        });

        if (!res.body) throw new Error("Response body is empty.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let leftover = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = leftover + decoder.decode(value, { stream: true });
            const lines = chunk.split('\n\n');
            leftover = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const jsonStr = line.replace('data: ', '');
                    try {
                        const parsed = JSON.parse(jsonStr);
                        if (parsed.text) {
                            setMessages(prev => {
                                const updatedMessages = [...prev];
                                const lastMessage = updatedMessages[updatedMessages.length - 1];
                                updatedMessages[updatedMessages.length - 1] = {
                                    ...lastMessage,
                                    text: lastMessage.text + parsed.text,
                                };
                                return updatedMessages;
                            });
                        } else if (parsed.event === 'done') {
                            if (!activeConversationId) {
                                const newConvId = parsed.conversationId;
                                setActiveConversationId(newConvId);
                                setConversations(prev => [{ id: newConvId, title: userMessageText.substring(0, 50) }, ...prev]);
                            }
                        } else if (parsed.error) {
                            setError(parsed.error);
                        }
                    } catch (e) {
                        console.error("Failed to parse JSON chunk:", jsonStr);
                    }
                }
            }
        }
    } catch (err: any) {
        setError(err.message);
        setMessages(prev => prev.slice(0, -2));
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <ThemeProvider theme={darkMode ? darkTheme : lightTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex' }}>
        <ConversationSidebar
          conversations={conversations}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          activeConversationId={activeConversationId}
        />
        <Container
          maxWidth={false}
          sx={{ display: 'flex', flexDirection: 'column', height: '100vh', pt: 2, pb: 2, boxSizing: 'border-box', flexGrow: 1, ml: '280px' }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h4" component="h1" gutterBottom>Markitome AI</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <FormControlLabel
                control={<Switch checked={darkMode} onChange={handleThemeChange} />}
                label={darkMode ? <Brightness4Icon /> : <Brightness7Icon />}
              />
              <Button onClick={signOut} variant="outlined" size="small">Sign Out</Button>
            </Box>
          </Box>

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
                      <Typography component="div" variant="body2" sx={{ color: 'text.primary' }}>
                        {msg.sender === 'ai' ? (
                          <ReactMarkdown components={{ code: (props) => <CodeBlock {...props} darkMode={darkMode} /> }}>
                            {msg.text}
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

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            {image && (
              <Box sx={{ position: 'relative', mb: 1, width: '100px', height: '100px' }}>
                <img src={image} alt="preview" style={{ width: '100%', height: '100%', borderRadius: '8px', objectFit: 'cover' }} />
                <IconButton
                  size="small"
                  onClick={() => setImage(null)}
                  sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(0,0,0,0.6)', color: 'white', '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' } }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            )}
            <TextField
              label="Type your message or upload an image..."
              variant="outlined"
              fullWidth
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isLoading}
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
                <input
                  type="file"
                  ref={imageInputRef}
                  onChange={handleImageChange}
                  style={{ display: 'none' }}
                  accept="image/*"
                />
                <IconButton onClick={() => imageInputRef.current?.click()} disabled={isLoading} sx={{ ml: 1 }}>
                  <ImageIcon />
                </IconButton>
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