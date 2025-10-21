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
  Alert
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { fetchAuthSession } from '@aws-amplify/auth'; // Ensure this is imported

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
  activeConversationId,
}) => {
  // Ref for the hidden file input element
  const fileInputRef = useRef<HTMLInputElement>(null);
  // State to manage the loading indicator during upload
  const [isUploading, setIsUploading] = useState(false);
  // State to show success or error messages after upload
  const [uploadStatus, setUploadStatus] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  // Function to trigger the file input click
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Function to handle file selection and upload
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return; // Exit if no file is selected

    setIsUploading(true);
    setUploadStatus(null); // Clear previous status messages
    const formData = new FormData();
    formData.append('file', file); // Append the selected file to FormData

    try {
      const token = await getAuthToken(); // Get the auth token
      // Send the file to the backend API endpoint
      const response = await fetch('/api/upload-knowledge', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Content-Type is set automatically by the browser for FormData
        },
        body: formData,
      });

      const result = await response.json(); // Parse the JSON response from the backend

      if (!response.ok) {
        // If the server response is not OK (e.g., 4xx or 5xx)
        throw new Error(result.detail || 'Upload failed');
      }
      // Show success message
      setUploadStatus({ message: `File '${file.name}' uploaded. Ingestion started.`, severity: 'success' });

    } catch (error: any) {
      // Show error message
      setUploadStatus({ message: `Upload failed: ${error.message}`, severity: 'error' });
    } finally {
      setIsUploading(false); // Stop the loading indicator
      // Reset the file input so the user can upload the same file again if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
          bgcolor: 'background.paper', // Ensure background color matches theme
        },
      }}
    >
      <Box sx={{ p: 2 }}>
        {/* Button to start a new chat */}
        <Button
          variant="outlined"
          fullWidth
          startIcon={<AddIcon />}
          onClick={onNewConversation}
          sx={{ mb: 2 }} // Margin below the New Chat button
        >
          New Chat
        </Button>

        {/* --- Document Upload Section --- */}
        {/* Hidden file input element */}
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
          // accept=".pdf,.txt,.md" // Uncomment to restrict allowed file types
        />
        {/* Visible button to trigger the file input */}
        <Button
          variant="contained"
          fullWidth
          // Show loading indicator or upload icon based on state
          startIcon={isUploading ? <CircularProgress size={20} color="inherit" /> : <UploadFileIcon />}
          onClick={handleUploadClick}
          disabled={isUploading} // Disable button during upload
        >
          {isUploading ? 'Uploading...' : 'Upload Document'}
        </Button>
        {/* Display upload status message (success or error) */}
        {uploadStatus && (
          <Alert severity={uploadStatus.severity} sx={{ mt: 1, fontSize: '0.8rem' }}>
            {uploadStatus.message}
          </Alert>
        )}
        {/* --------------------------- */}
      </Box>

      {/* --- Conversation History List --- */}
      <List sx={{ overflowY: 'auto' }}> {/* Allow scrolling for history */}
        <ListItem>
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>History</Typography>
        </ListItem>
        {conversations.map((conv) => (
          <ListItem key={conv.id} disablePadding>
            <ListItemButton
              selected={conv.id === activeConversationId} // Highlight the active conversation
              onClick={() => onSelectConversation(conv.id)}
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
    </Drawer>
  );
};