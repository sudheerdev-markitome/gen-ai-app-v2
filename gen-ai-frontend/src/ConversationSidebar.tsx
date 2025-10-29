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
  Alert,
  TextField
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete'; // Keep delete icon
import EditIcon from '@mui/icons-material/Edit'; // Add Edit Icon
import CheckIcon from '@mui/icons-material/Check'; // Add Check Icon for saving
import CloseIcon from '@mui/icons-material/Close'; // Add Close Icon for canceling

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
  onRenameConversation: (id: string, newTitle: string) => Promise<Conversation>; // Add rename handler prop
  activeConversationId: string | null;
}

const drawerWidth = 280; // Define the width of the sidebar

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation, // Destructure the delete handler
  onRenameConversation,
  activeConversationId,
  
}) => {
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
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

  // --- NEW: Rename Handling ---
  const handleEditClick = (event: React.MouseEvent, conversation: Conversation) => {
    event.stopPropagation();
    setEditingConversationId(conversation.id);
    setRenameValue(conversation.title); // Pre-fill input with current title
    setStatus(null);
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
    setStatus(null);

    try {
      await onRenameConversation(editingConversationId, renameValue.trim());
      setStatus({ message: 'Conversation renamed.', severity: 'success' });
      handleCancelRename(); // Exit editing mode on success
    } catch (error: any) {
      setStatus({ message: `Rename failed: ${error.message}`, severity: 'error' });
      // Keep editing mode active on failure so user can retry/edit
    } finally {
      setIsRenaming(false);
    }
  };
  // -------------------------

return (
    <Drawer
      variant="permanent" // Keeps the sidebar always visible
      anchor="left"       // Positions the sidebar on the left
      sx={{
        width: drawerWidth, // Set the width
        flexShrink: 0,      // Prevent the sidebar from shrinking
        '& .MuiDrawer-paper': { // Style the paper component inside the Drawer
          width: drawerWidth,
          boxSizing: 'border-box', // Include padding and border in the element's total width and height
          bgcolor: 'background.paper', // Use theme's background color
        },
      }}
    >
      {/* --- Top Section: New Chat & Status Messages --- */}
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Button
          variant="outlined"
          fullWidth
          startIcon={<AddIcon />}
          onClick={onNewConversation}
          // Removed sx={{ mb: 2 }} as upload button is gone
        >
          New Chat
        </Button>
         {/* Display status messages (e.g., for delete success/error) */}
         {status && (
          <Alert severity={status.severity} sx={{ mt: 1, fontSize: '0.8rem' }}>
            {status.message}
          </Alert>
        )}
      </Box>

      {/* --- Conversation History List --- */}
      <List sx={{ overflowY: 'auto', flexGrow: 1 }}> {/* Allow list to scroll and fill available space */}
        <ListItem>
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>History</Typography>
        </ListItem>
        {conversations.map((conv) => (
          <ListItem
             key={conv.id} // Unique key for each list item
             disablePadding // Remove default padding
             secondaryAction={ // Content aligned to the right side of the list item
               // Show different icons based on whether this item is being edited
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
             // Adjust right padding to accommodate the icons
             sx={{ pr: '70px' }}
           >
            {/* Show TextField for editing or ListItemButton for display */}
            {editingConversationId === conv.id ? (
              <TextField
                value={renameValue}           // Controlled input value
                onChange={handleRenameChange} // Update state on change
                variant="standard"          // Minimalist text field style
                size="small"
                fullWidth                   // Take up available width
                autoFocus                   // Focus when it appears
                disabled={isRenaming}       // Disable while saving
                // Keyboard shortcuts for save (Enter) and cancel (Escape)
                onKeyDown={(e) => {
                   if (e.key === 'Enter') handleSaveRename(e as any);
                   if (e.key === 'Escape') handleCancelRename();
                 }}
                 // Style to roughly match the ListItemText appearance
                sx={{ ml: 1, mr: 1, my: '6px' }}
              />
            ) : (
              // Standard display button for the conversation
              <ListItemButton
                selected={conv.id === activeConversationId} // Highlight if active
                onClick={() => onSelectConversation(conv.id)} // Select conversation on click
              >
                <ListItemText
                  primary={conv.title} // Display the conversation title
                  primaryTypographyProps={{
                    noWrap: true,       // Prevent title from wrapping to multiple lines
                    sx: { fontSize: '0.9rem' } // Slightly smaller font size
                   }}
                />
              </ListItemButton>
            )}
          </ListItem>
        ))}
      </List>

      {/* --- Delete Confirmation Dialog --- */}
      <Dialog
        open={openDeleteDialog}          // Control visibility with state
        onClose={handleCloseDeleteDialog} // Handler to close the dialog
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
          {/* Cancel Button */}
          <Button onClick={handleCloseDeleteDialog} disabled={isDeleting}>
            Cancel
          </Button>
          {/* Delete Button */}
          <Button onClick={handleConfirmDelete} color="error" autoFocus disabled={isDeleting}>
            {/* Show loading spinner while deleting */}
            {isDeleting ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );