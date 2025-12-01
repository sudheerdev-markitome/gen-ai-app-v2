// src/ArtifactPanel.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tabs,
  Tab,
  Paper,
  Divider
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CodeIcon from '@mui/icons-material/Code';
import PreviewIcon from '@mui/icons-material/Visibility';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import materialDark from 'react-syntax-highlighter/dist/cjs/styles/prism/material-dark';
import materialLight from 'react-syntax-highlighter/dist/cjs/styles/prism/material-light';

interface ArtifactPanelProps {
  content: string;
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
}

const CodeBlock = ({ node, inline, className, children, darkMode, ...props }: any) => {
  const match = /language-(\w+)/.exec(className || '');
  return !inline && match ? (
      <SyntaxHighlighter style={darkMode ? materialDark : materialLight} language={match[1]} PreTag="div" {...props}>
          {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
  ) : ( <code className={className} {...props}>{children}</code> );
};

export const ArtifactPanel: React.FC<ArtifactPanelProps> = ({ content, isOpen, onClose, darkMode }) => {
  const [tabIndex, setTabIndex] = useState(0);
  const [isHtml, setIsHtml] = useState(false);

  // Simple detection to see if the content looks like HTML code block
  useEffect(() => {
    if (content.includes('```html') || content.includes('<!DOCTYPE html>') || content.includes('<html>')) {
      setIsHtml(true);
      setTabIndex(1); // Default to preview if HTML
    } else {
      setIsHtml(false);
      setTabIndex(0);
    }
  }, [content]);

  // Extract clean HTML code if wrapped in markdown code blocks
  const getCleanHtml = (raw: string) => {
    const match = raw.match(/```html([\s\S]*?)```/);
    return match ? match[1] : raw;
  };

  if (!isOpen) return null;

  return (
    <Paper
      elevation={4}
      sx={{
        width: '45%', // Takes up 45% of the screen width
        minWidth: '400px',
        height: '100%',
        borderLeft: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 1200, // Above standard elements
        borderRadius: 0
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'background.default' }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Artifact Preview
        </Typography>
        <Box>
             {/* Tabs only visible if content is HTML-like */}
            {isHtml && (
                <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={{ minHeight: 0, mr: 2, display: 'inline-flex', verticalAlign: 'middle' }}>
                    <Tab icon={<CodeIcon fontSize="small"/>} label="Code" sx={{ minHeight: 0, py: 0 }} />
                    <Tab icon={<PreviewIcon fontSize="small"/>} label="Preview" sx={{ minHeight: 0, py: 0 }} />
                </Tabs>
            )}
            <IconButton onClick={onClose} size="small">
                <CloseIcon />
            </IconButton>
        </Box>
      </Box>
      <Divider />

      {/* Content Area */}
      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 3, bgcolor: tabIndex === 1 ? '#fff' : 'background.paper' }}>
        {tabIndex === 0 && (
           // Markdown / Code View
           <Box sx={{ '& pre': { m: 0 } }}>
               <ReactMarkdown components={{ code: (props) => <CodeBlock {...props} darkMode={darkMode} /> }}>
                 {content}
               </ReactMarkdown>
           </Box>
        )}

        {tabIndex === 1 && isHtml && (
           // Live HTML Preview using Iframe sandbox
           <iframe
             title="Artifact Preview"
             srcDoc={getCleanHtml(content)}
             style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#fff' }}
             sandbox="allow-scripts" // Allow scripts but prevent navigating top frame
           />
        )}
      </Box>
    </Paper>
  );
};