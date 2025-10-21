// src/ConversationSidebar.tsx
import React, { useRef, useState } from 'react';
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
  Alert,
  IconButton, // Added for delete button
  Dialog, // Added for confirmation dialog
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteIcon from '@mui/icons-material/Delete'; // Added delete icon
import { fetchAuthSession } from '@aws-amplify/auth'; // For getting auth token

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

// Helper function to get the current user's authentication token
const getAuthToken = async () => {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (!idToken) throw new Error("User is not authenticated.");
  return idToken;
};

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation, // Destructure the delete handler
  activeConversationId,
}) => {
  // Ref for the hidden file input element
  const fileInputRef = useRef<HTMLInputElement>(null);
  // State for upload loading indicator
  const [isUploading, setIsUploading] = useState(false);
  // State for upload success/error messages
  const [uploadStatus, setUploadStatus] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  // State for controlling the delete confirmation dialog
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  // State to store the ID of the conversation marked for deletion
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  // State for delete loading indicator
  const [isDeleting, setIsDeleting] = useState(false);

  // --- Upload Handlers ---
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = await getAuthToken();
      const response = await fetch('/api/upload-knowledge', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Upload failed');
      setUploadStatus({ message: `File '${file.name}' uploaded. Ingestion started.`, severity: 'success' });
    } catch (error: any) {
      setUploadStatus({ message: `Upload failed: ${error.message}`, severity: 'error' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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
    setUploadStatus(null); // Clear other statuses

    try {
      await onDeleteConversation(conversationToDelete); // Call parent handler
      setUploadStatus({ message: 'Conversation deleted successfully.', severity: 'success'});
    } catch (error: any) {
      setUploadStatus({ message: `Failed to delete conversation: ${error.message}`, severity: 'error' });
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
      {/* --- Top Section: New Chat & Upload --- */}
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Button
          variant="outlined"
          fullWidth
          startIcon={<AddIcon />}
          onClick={onNewConversation}
          sx={{ mb: 2 }}
        >
          New Chat
        </Button>

        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <Button
          variant="contained"
          fullWidth
          startIcon={isUploading ? <CircularProgress size={20} color="inherit" /> : <UploadFileIcon />}
          onClick={handleUploadClick}
          disabled={isUploading}
        >
          {isUploading ? 'Uploading...' : 'Upload Document'}
        </Button>
        {uploadStatus && (
          <Alert severity={uploadStatus.severity} sx={{ mt: 1, fontSize: '0.8rem' }}>
            {uploadStatus.message}
          </Alert>
        )}
      </Box>

      {/* --- Conversation History List --- */}
      <List sx={{ overflowY: 'auto', flexGrow: 1 }}> {/* Allow list to grow and scroll */}
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