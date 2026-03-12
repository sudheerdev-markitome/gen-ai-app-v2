
import { useState, useEffect } from 'react';
import { Box, Paper, Typography, Button, Slide, Link } from '@mui/material';
import CookieOutlinedIcon from '@mui/icons-material/CookieOutlined';

const CookieConsent = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      const timer = setTimeout(() => setOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookie-consent', 'true');
    setOpen(false);
  };

  return (
    <Slide direction="up" in={open} mountOnEnter unmountOnExit>
      <Paper
        elevation={10}
        sx={{
          position: 'fixed',
          bottom: { xs: 16, md: 24 },
          left: { xs: 16, md: 24 },
          right: { xs: 16, md: 'auto' },
          maxWidth: { md: 450 },
          p: 3,
          borderRadius: 4,
          zIndex: 9999,
          border: '1px solid rgba(0,0,0,0.05)',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <CookieOutlinedIcon color="primary" sx={{ mt: 0.5 }} />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
              We use cookies
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              We use cookies to improve your experience and analyze site usage. By clicking "Accept", you agree to our 
              <Link href="/privacy" sx={{ mx: 0.5 }}>Privacy Policy</Link> and 
              <Link href="/terms" sx={{ ml: 0.5 }}>Terms</Link>.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button 
                variant="contained" 
                size="small" 
                onClick={handleAccept}
                sx={{ 
                  textTransform: 'none', 
                  borderRadius: 2,
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
                }}
              >
                Accept All
              </Button>
              <Button 
                variant="text" 
                size="small" 
                onClick={() => setOpen(false)}
                sx={{ textTransform: 'none', borderRadius: 2 }}
              >
                Essential Only
              </Button>
            </Box>
          </Box>
        </Box>
      </Paper>
    </Slide>
  );
};

export default CookieConsent;
