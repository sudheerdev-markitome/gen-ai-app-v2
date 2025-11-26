// src/SharedChat.tsx
import React, { useEffect, useState } from 'react';
import {
  Box, Container, CssBaseline, Paper, List, ListItem, Avatar, ListItemText,
  Typography, CircularProgress, Alert, Button
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import materialLight from 'react-syntax-highlighter/dist/cjs/styles/prism/material-light';

// Simple Theme for shared view
import { ThemeProvider, createTheme } from '@mui/material/styles';
const theme = createTheme({ palette: { mode: 'light' } });

const CodeBlock = ({ node, inline, className, children, ...props }: any) => {
  const match = /language-(\w+)/.exec(className || '');
  return !inline && match ? (
      <SyntaxHighlighter style={materialLight} language={match[1]} PreTag="div" {...props}>
          {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
  ) : ( <code className={className} {...props}>{children}</code> );
};

export const SharedChat: React.FC = () => {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Get shareId from URL (simple extraction)
    const pathParts = window.location.pathname.split('/');
    const shareId = pathParts[pathParts.length - 1];

    const fetchSharedChat = async () => {
      try {
        const res = await fetch(`/api/share/${shareId}`);
        if (!res.ok) throw new Error("Failed to load shared chat");
        const data = await res.json();
        setMessages(data.messages);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchSharedChat();
  }, []);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
  if (error) return <Container sx={{ mt: 10 }}><Alert severity="error">{error}</Alert></Container>;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
           <Typography variant="h4">Shared Chat</Typography>
           <Button variant="outlined" href="/">Go to Markitome AI</Button>
        </Box>
        <Paper elevation={3} sx={{ p: 2 }}>
          <List>
            {messages.map((msg, index) => (
              <ListItem key={index} sx={{ alignItems: 'flex-start' }}>
                <Avatar sx={{ bgcolor: msg.sender === 'user' ? 'primary.main' : 'secondary.main', mr: 2 }}>
                  {msg.sender === 'user' ? <PersonIcon /> : <SmartToyIcon />}
                </Avatar>
                <ListItemText
                  primary={msg.sender === 'user' ? 'User' : 'AI'}
                  secondary={
                    <Typography component="div" variant="body2" sx={{ color: 'text.primary' }}>
                       {msg.sender === 'ai' ? (
                          <ReactMarkdown components={{ code: CodeBlock }}>{msg.text}</ReactMarkdown>
                        ) : (
                          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                        )}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      </Container>
    </ThemeProvider>
  );
};