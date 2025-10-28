// src/ConversationSidebar.tsx
import React, { useState } from 'react'; // Removed useRef
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Button,
  Box,
  Typography,
  IconButton, // Keep for delete button
  Dialog, // Keep for confirmation dialog
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  CircularProgress, // Keep for delete loading
  Alert
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete'; // Keep delete icon
// Removed UploadFileIcon and fetchAuthSession (assuming token is handled in App.tsx)

// Interface for a single conversation item
interface Conversation {
  id: string;
  title: string;
}

// Props definition for the component, including the delete handler
interface ConversationSidebarProps {
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => Promise<void>; // Handler for deleting
  activeConversationId: string | null;
}

const drawerWidth = 280; // Define the width of the sidebar

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation, // Destructure the delete handler
  activeConversationId,
}) => {
  // State for controlling the delete confirmation dialog
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  // State to store the ID of the conversation marked for deletion
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  // State for delete loading indicator
  const [isDeleting, setIsDeleting] = useState(false);
  // State for showing status messages (can be used for delete success/error)
  const [status, setStatus] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);


  // --- Delete Handlers ---
  const handleDeleteClick = (event: React.MouseEvent, conversationId: string) => {
    event.stopPropagation(); // Prevent ListItemButton click when clicking the icon
    setConversationToDelete(conversationId);
    setOpenDeleteDialog(true);
    setStatus(null); // Clear previous statuses
  };

  const handleCloseDeleteDialog = () => {
    setOpenDeleteDialog(false);
    setConversationToDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!conversationToDelete) return;
    setIsDeleting(true);
    setStatus(null); // Clear previous statuses

    try {
      await onDeleteConversation(conversationToDelete); // Call parent handler
      setStatus({ message: 'Conversation deleted successfully.', severity: 'success'});
      // No need to manually filter here, App.tsx handles state update
    } catch (error: any) {
      setStatus({ message: `Failed to delete conversation: ${error.message}`, severity: 'error' });
    } finally {
      setIsDeleting(false);
      handleCloseDeleteDialog(); // Close the dialog regardless of outcome
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
      {/* --- Top Section: New Chat Only --- */}
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Button
          variant="outlined"
          fullWidth
          startIcon={<AddIcon />}
          onClick={onNewConversation}
          // sx={{ mb: 2 }} // Removed margin as upload button is gone
        >
          New Chat
        </Button>
         {/* Display status message (for delete success/error) */}
         {status && (
          <Alert severity={status.severity} sx={{ mt: 1, fontSize: '0.8rem' }}>
            {status.message}
          </Alert>
        )}
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
             secondaryAction={ // Add delete button to the right side
               <IconButton
                 edge="end"
                 aria-label="delete conversation"
                 onClick={(e) => handleDeleteClick(e, conv.id)}
                 size="small"
                 sx={{ mr: 1 }} // Add margin if needed
               >
                 <DeleteIcon fontSize="inherit" />
               </IconButton>
             }
           >
            <ListItemButton
              selected={conv.id === activeConversationId} // Highlight active chat
              onClick={() => onSelectConversation(conv.id)}
              sx={{ pr: '40px' }} // Add padding to prevent text overlap with icon
            >
              <ListItemText
                primary={conv.title}
                primaryTypographyProps={{
                  noWrap: true, // Prevent long titles from wrapping
                  sx: { fontSize: '0.9rem' }
                 }}
               />
            </ListItemButton>
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

// Export default if needed, or keep as named export
// export default ConversationSidebar;