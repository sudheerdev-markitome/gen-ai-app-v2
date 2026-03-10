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

import { ThemeProvider } from '@mui/material/styles';
import customTheme from './theme';
import { useMediaQuery, useTheme } from '@mui/material';

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

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
  if (error) return (
    <ThemeProvider theme={customTheme}>
      <CssBaseline />
      <Container maxWidth="md" sx={{ mt: 10 }}><Alert severity="error">{error}</Alert></Container>
    </ThemeProvider>
  );

  return (
    <ThemeProvider theme={customTheme}>
      <CssBaseline />
      <Container 
        maxWidth="md" 
        sx={{ 
          display: 'flex', flexDirection: 'column', height: '100vh',
          py: { xs: 2, md: 4 }, px: { xs: 2, md: 4 }
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
          boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)'
        }}>
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
          <Button variant="contained" href="/" size={isMobile ? "small" : "medium"} 
            sx={{ 
              borderRadius: 2, 
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              textTransform: 'none',
              fontWeight: 600
            }}
          >
            Create Your Own
          </Button>
        </Box>

        <Paper 
          elevation={0} 
          sx={{ 
            flexGrow: 1,
            overflowY: 'auto',
            p: { xs: 2, md: 3 },
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
                  maxWidth: { xs: '95%', md: '85%' }
                }}>
                  <Avatar sx={{ 
                    width: 32, 
                    height: 32, 
                    bgcolor: msg.sender === 'user' ? 'primary.main' : '#f1f5f9',
                    border: '1px solid rgba(148, 163, 184, 0.1)',
                    color: msg.sender === 'user' ? 'white' : 'text.primary'
                  }}>
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
                          : '#f8fafc',
                        color: msg.sender === 'user' ? 'white' : 'text.primary',
                        border: msg.sender === 'ai' ? '1px solid rgba(148, 163, 184, 0.2)' : 'none'
                      }}
                    >
                      <Typography component="div" variant="body2" sx={{ lineHeight: 1.6 }}>
                        {msg.sender === 'ai' ? (
                          <ReactMarkdown components={{ code: CodeBlock }}>{msg.text}</ReactMarkdown>
                        ) : (
                          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                        )}
                      </Typography>
                    </Paper>
                  </Box>
                </Box>
              </ListItem>
            ))}
          </List>
        </Paper>
        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Shared via Markitome AI - The intelligent content studio for marketers.
          </Typography>
        </Box>
      </Container>
    </ThemeProvider>
  );
};