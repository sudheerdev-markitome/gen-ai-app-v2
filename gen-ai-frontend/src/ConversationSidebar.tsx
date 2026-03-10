// src/ConversationSidebar.tsx
import React, { useState } from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Button,
  Box,
  Typography,
  CircularProgress,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField // Added for renaming
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit'; // Added for renaming
import CheckIcon from '@mui/icons-material/Check'; // Added for saving rename
import CloseIcon from '@mui/icons-material/Close'; // Added for canceling rename
import { toast } from 'react-hot-toast'; // Import toast for notifications

// Interface for a single conversation item
interface Conversation {
  id: string;
  title: string;
}

// Props definition for the component
interface ConversationSidebarProps {
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => Promise<void>;
  onRenameConversation: (id: string, newTitle: string) => Promise<Conversation>; // Handler for renaming
  activeConversationId: string | null;
  isMobile: boolean;
  mobileOpen: boolean;
  onClose: () => void;
}

const drawerWidth = 260; 

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onRenameConversation, // Destructure the rename handler
  activeConversationId,
  isMobile,
  mobileOpen,
  onClose,
}) => {
  // --- State for Delete Dialog ---
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // --- State for Rename ---
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // --- Delete Handlers ---
  const handleDeleteClick = (event: React.MouseEvent, conversationId: string) => {
    event.stopPropagation(); // Prevent ListItemButton click when clicking the icon
    setConversationToDelete(conversationId);
    setOpenDeleteDialog(true);
  };

  const handleCloseDeleteDialog = () => {
    setOpenDeleteDialog(false);
    setConversationToDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!conversationToDelete) return;
    setIsDeleting(true);

    try {
      await onDeleteConversation(conversationToDelete); // Call parent handler
      toast.success('Conversation deleted!'); // Use toast for success
    } catch (error: any) {
      toast.error(`Failed to delete: ${error.message}`); // Use toast for error
    } finally {
      setIsDeleting(false);
      handleCloseDeleteDialog(); // Close the dialog
    }
  };

  // --- Rename Handlers ---
  const handleEditClick = (event: React.MouseEvent, conversation: Conversation) => {
    event.stopPropagation(); // Prevent selection
    setEditingConversationId(conversation.id);
    setRenameValue(conversation.title); // Pre-fill input with current title
  };

  const handleRenameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRenameValue(event.target.value);
  };

  const handleCancelRename = (event?: React.MouseEvent) => {
    event?.stopPropagation();
    setEditingConversationId(null);
    setRenameValue('');
  };

  const handleSaveRename = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!editingConversationId || !renameValue.trim() || isRenaming) return;

    setIsRenaming(true);

    try {
      await onRenameConversation(editingConversationId, renameValue.trim());
      toast.success('Conversation renamed!'); // Use toast
      handleCancelRename(); // Exit editing mode on success
    } catch (error: any) {
      toast.error(`Rename failed: ${error.message}`); // Use toast
    } finally {
      setIsRenaming(false);
    }
  };


  return (
    <Drawer
      variant={isMobile ? 'temporary' : 'permanent'}
      open={isMobile ? mobileOpen : true}
      onClose={onClose}
      anchor="left"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          bgcolor: 'background.paper',
          borderRight: '1px solid rgba(148, 163, 184, 0.1)'
        },
      }}
      ModalProps={{
        keepMounted: true, // Better open performance on mobile.
      }}
    >
      {/* --- Brand Section --- */}
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <img 
            src="/markitome-logo.png" 
            alt="Markitome Logo" 
            style={{ 
              height: '32px', 
              width: 'auto' 
            }} 
          />
          {isMobile && (
            <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>
              <CloseIcon />
            </IconButton>
          )}
        </Box>
        <Typography 
          variant="caption" 
          sx={{ 
            color: 'text.secondary', 
            fontWeight: 500,
            mt: 0.5,
            fontSize: '0.7rem',
            letterSpacing: '0.02em'
          }}
        >
          Your Intelligent Marketing Assistant
        </Typography>
      </Box>

      {/* --- Top Section: New Chat Button --- */}
      <Box sx={{ p: 2, pt: 0 }}>
        <Button
          variant="contained"
          fullWidth
          startIcon={<AddIcon />}
          onClick={onNewConversation}
          sx={{
            py: 1,
            borderRadius: '10px',
            textTransform: 'none',
            fontWeight: 600,
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
            '&:hover': {
              background: 'linear-gradient(135deg, #818cf8 0%, #6366f1 100%)',
              boxShadow: '0 6px 16px rgba(99, 102, 241, 0.4)',
            }
          }}
        >
          New Chat
        </Button>
      </Box>

      {/* --- Conversation History List --- */}
      <List sx={{ overflowY: 'auto', flexGrow: 1 }}>
        <ListItem>
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>History</Typography>
        </ListItem>
        {conversations.map((conv) => (
          <ListItem
             key={conv.id}
             disablePadding
             secondaryAction={
               editingConversationId === conv.id ? (
                 // Save/Cancel icons when editing
                 <>
                   <IconButton edge="end" size="small" onClick={handleSaveRename} disabled={isRenaming}>
                     {isRenaming ? <CircularProgress size={16} /> : <CheckIcon fontSize="inherit" />}
                   </IconButton>
                   <IconButton edge="end" size="small" onClick={handleCancelRename} disabled={isRenaming} sx={{ ml: 0.5 }}>
                     <CloseIcon fontSize="inherit" />
                   </IconButton>
                 </>
               ) : (
                 // Edit/Delete icons when not editing
                 <>
                   <IconButton edge="end" size="small" onClick={(e) => handleEditClick(e, conv)} sx={{ mr: 0.5 }}>
                     <EditIcon fontSize="inherit" />
                   </IconButton>
                   <IconButton edge="end" size="small" onClick={(e) => handleDeleteClick(e, conv.id)}>
                     <DeleteIcon fontSize="inherit" />
                   </IconButton>
                 </>
               )
             }
             sx={{ pr: '70px' }} // Keep padding for icons
           >
            {/* Show TextField for editing or ListItemButton for display */}
            {editingConversationId === conv.id ? (
              <TextField
                value={renameValue}
                onChange={handleRenameChange}
                variant="standard"
                size="small"
                fullWidth
                autoFocus
                disabled={isRenaming}
                onKeyDown={(e) => {
                   if (e.key === 'Enter') handleSaveRename(e as any);
                   if (e.key === 'Escape') handleCancelRename();
                 }}
                sx={{ ml: 1, mr: 1, my: '6px' }}
              />
            ) : (
              <ListItemButton
                selected={conv.id === activeConversationId}
                onClick={() => onSelectConversation(conv.id)}
                sx={{
                  mx: 1,
                  borderRadius: '10px',
                  mb: 0.5,
                  transition: 'all 0.2s',
                  '&.Mui-selected': {
                    bgcolor: 'rgba(99, 102, 241, 0.1)',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                    '&:hover': {
                      bgcolor: 'rgba(99, 102, 241, 0.15)',
                    }
                  }
                }}
              >
                <ListItemText
                  primary={conv.title}
                  primaryTypographyProps={{
                    noWrap: true,
                    sx: { 
                      fontSize: '0.875rem', 
                      fontWeight: conv.id === activeConversationId ? 600 : 400,
                      color: conv.id === activeConversationId ? 'primary.main' : 'text.primary'
                    }
                   }}
                />
              </ListItemButton>
            )}
          </ListItem>
        ))}
      </List>

      {/* --- Delete Confirmation Dialog --- */}
      <Dialog
        open={openDeleteDialog}
        onClose={handleCloseDeleteDialog}
        aria-labelledby="delete-confirmation-dialog-title"
        aria-describedby="delete-confirmation-dialog-description"
      >
        <DialogTitle id="delete-confirmation-dialog-title">
          {"Delete Conversation?"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-confirmation-dialog-description">
            Are you sure you want to permanently delete this conversation and all its messages? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} disabled={isDeleting}>
            Cancel
          </Button>
          <Button onClick={handleConfirmDelete} color="error" autoFocus disabled={isDeleting}>
            {isDeleting ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
};