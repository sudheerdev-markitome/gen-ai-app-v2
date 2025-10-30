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
}

const drawerWidth = 280; // Define the width of the sidebar

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onRenameConversation, // Destructure the rename handler
  activeConversationId,
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
      variant="permanent"
      anchor="left"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          bgcolor: 'background.paper',
        },
      }}
    >
      {/* --- Top Section: New Chat Button --- */}
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Button
          variant="outlined"
          fullWidth
          startIcon={<AddIcon />}
          onClick={onNewConversation}
        >
          New Chat
        </Button>
         {/* Note: The Alert component was removed. Feedback is now handled by toast. */}
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
              >
                <ListItemText
                  primary={conv.title}
                  primaryTypographyProps={{
                    noWrap: true,
                    sx: { fontSize: '0.9rem' }
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