// src/FeedbackDialog.tsx
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography
} from '@mui/material';
import { toast } from 'react-hot-toast';
import { fetchAuthSession } from '@aws-amplify/auth';

interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
}

export const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ open, onClose }) => {
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('bug');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setIsSubmitting(true);

    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message, category }),
      });

      if (!res.ok) throw new Error('Failed to submit feedback');

      toast.success('Thank you for your feedback!');
      setMessage('');
      setCategory('bug');
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Failed to submit feedback.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Submit Feedback / Report Bug</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Let us know if something isn't working or if you have ideas for improvement.
        </Typography>
        
        <FormControl fullWidth size="small" sx={{ mb: 2, mt: 1 }}>
          <InputLabel>Category</InputLabel>
          <Select
            value={category}
            label="Category"
            onChange={(e) => setCategory(e.target.value)}
          >
            <MenuItem value="bug">Report a Bug 🐞</MenuItem>
            <MenuItem value="feature">Feature Request 💡</MenuItem>
            <MenuItem value="general">General Feedback 💬</MenuItem>
          </Select>
        </FormControl>

        <TextField
          autoFocus
          margin="dense"
          label="Your Message"
          fullWidth
          multiline
          rows={4}
          variant="outlined"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe the issue or idea..."
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={isSubmitting || !message.trim()}>
          {isSubmitting ? 'Sending...' : 'Submit'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};