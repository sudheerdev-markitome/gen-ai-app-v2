// src/ConversationSidebar.tsx
import React from 'react';
import { Drawer, List, ListItem, ListItemButton, ListItemText, Button, Box, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

interface Conversation {
  id: string;
  title: string;
}

interface ConversationSidebarProps {
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  activeConversationId: string | null;
}

const drawerWidth = 280;

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  onSelectConversation,
  onNewConversation,
  activeConversationId,
}) => {
  return (
    <Drawer
      variant="permanent"
      anchor="left"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
        },
      }}
    >
      <Box sx={{ p: 2 }}>
        <Button
          variant="outlined"
          fullWidth
          startIcon={<AddIcon />}
          onClick={onNewConversation}
        >
          New Chat
        </Button>
      </Box>
      <List>
        <ListItem>
          <Typography variant="overline">History</Typography>
        </ListItem>
        {conversations.map((conv) => (
          <ListItem key={conv.id} disablePadding>
            <ListItemButton
              selected={conv.id === activeConversationId}
              onClick={() => onSelectConversation(conv.id)}
            >
              <ListItemText primary={conv.title} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Drawer>
  );
};
