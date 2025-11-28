// src/PromptLibrary.tsx
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Box,
  InputAdornment,
  TextField
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import SearchIcon from '@mui/icons-material/Search';

// Define the structure of our library data
interface PromptCategory {
  category: string;
  prompts: string[];
}

// Sample Data - You can expand this later or fetch from an API
const PROMPT_DATA: PromptCategory[] = [
  {
    category: "Social Media 📱",
    prompts: [
      "Write 5 engaging Instagram captions for a new product launch about [Product Name] features.",
      "Create a LinkedIn thought leadership post about the impact of AI on digital marketing.",
      "Draft a Twitter thread summarizing the key benefits of [Service Name].",
      "Write a catchy TikTok script for a 30-second video showcasing [Product/Feature].",
      "Generate 10 relevant hashtags for a post about [Topic] to maximize reach."
    ]
  },
  {
    "category": "Email Marketing 📧",
    "prompts": [
      "Write a cold outreach email to a potential B2B client introducing [Company Name].",
      "Draft a 'Welcome' email sequence for new subscribers to our newsletter.",
      "Create a re-engagement email for customers who haven't purchased in 3 months.",
      "Write 5 curiosity-inducing subject lines for an email about [Topic].",
      "Draft a newsletter section highlighting our latest blog post: [Link/Title]."
    ]
  },
  {
    "category": "Content & SEO ✍️",
    "prompts": [
      "Outline a comprehensive blog post about [Topic] with H2 and H3 headers.",
      "Rewrite this paragraph to be more concise and persuasive: [Paste Text]",
      "Generate a list of long-tail keywords related to [Industry/Niche].",
      "Write a meta description for a webpage about [Page Topic], under 160 characters.",
      "Create an FAQ section with 5 questions and answers about [Product/Service]."
    ]
  },
  {
    "category": "Strategy & Analysis 📊",
    "prompts": [
      "Analyze the pros and cons of entering the [Specific Market] market.",
      "Create a SWOT analysis for [Company/Product].",
      "Suggest 3 unique value propositions for a brand that sells [Product].",
      "Identify the target audience persona for a premium [Product Type]."
    ]
  }
];

interface PromptLibraryProps {
  open: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
}

export const PromptLibrary: React.FC<PromptLibraryProps> = ({ open, onClose, onSelectPrompt }) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter logic
  const filteredData = PROMPT_DATA.map(cat => ({
    ...cat,
    prompts: cat.prompts.filter(p => p.toLowerCase().includes(searchTerm.toLowerCase()))
  })).filter(cat => cat.prompts.length > 0);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LibraryBooksIcon color="primary" />
        Marketing Prompt Library
      </DialogTitle>
      
      <DialogContent dividers>
        <Box sx={{ mb: 3 }}>
          <TextField
            fullWidth
            placeholder="Search prompts..."
            variant="outlined"
            size="small"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {filteredData.length === 0 ? (
          <Typography variant="body1" align="center" color="text.secondary" sx={{ py: 4 }}>
            No prompts found matching "{searchTerm}"
          </Typography>
        ) : (
          filteredData.map((category, index) => (
            <Accordion key={category.category} defaultExpanded={index === 0} disableGutters elevation={0} sx={{ '&:before': { display: 'none' }, border: '1px solid #e0e0e0', mb: 1, borderRadius: 1 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" fontWeight="bold">
                  {category.category}
                </Typography>
                <Chip label={category.prompts.length} size="small" sx={{ ml: 2, height: 20 }} />
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                <List disablePadding>
                  {category.prompts.map((prompt, pIndex) => (
                    <ListItem key={pIndex} disablePadding>
                      <ListItemButton 
                        onClick={() => onSelectPrompt(prompt)}
                        sx={{ 
                          '&:hover': { bgcolor: 'action.hover' },
                          borderTop: '1px solid #f0f0f0'
                        }}
                      >
                        <ListItemText primary={prompt} />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>
          ))
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};