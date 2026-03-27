
import React, { useState } from 'react';
import { 
  Box, Container, Typography, TextField, Button, 
  Paper, Stack, IconButton, Fade,
  CircularProgress
} from '@mui/material';
import { ArrowBack, Send, CheckCircleOutline } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const RequestAccess = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    companyName: '',
    phoneNumber: '',
    email: '',
    details: 'Requested access via the new form.'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/notify/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setSubmitted(true);
        toast.success("Request sent successfully!");
      } else {
        toast.error("Failed to send request. Please try again.");
      }
    } catch (err) {
      console.error('Request failed', err);
      toast.error("An error occurred. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Box sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)',
        p: 2
      }}>
        <Fade in timeout={800}>
          <Paper elevation={0} sx={{ 
            p: 6, 
            maxWidth: 500, 
            textAlign: 'center', 
            borderRadius: 6,
            border: '1px solid rgba(0,0,0,0.05)',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.08)'
          }}>
            <CheckCircleOutline sx={{ fontSize: 80, color: 'success.main', mb: 3 }} />
            <Typography variant="h4" sx={{ fontWeight: 800, mb: 2, color: '#1e293b' }}>
              Request Received!
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.7 }}>
              Thank you for your interest in Markitome AI. Our team will review your application and get back to you at <strong>{formData.email}</strong> shortly.
            </Typography>
            <Button 
              variant="contained" 
              fullWidth 
              size="large"
              onClick={() => navigate('/')}
              sx={{ 
                borderRadius: 3, 
                py: 1.5,
                fontWeight: 700,
                textTransform: 'none',
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
              }}
            >
              Back to Home
            </Button>
          </Paper>
        </Fade>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <Container maxWidth="lg" sx={{ pt: 4 }}>
        <IconButton onClick={() => navigate('/')} sx={{ mb: 2 }}>
          <ArrowBack />
        </IconButton>
      </Container>

      <Container maxWidth="sm" sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', pb: 8 }}>
        <Paper elevation={0} sx={{ 
          p: { xs: 4, md: 6 }, 
          width: '100%', 
          borderRadius: 6,
          border: '1px solid rgba(0,0,0,0.05)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.08)',
          bgcolor: '#ffffff'
        }}>
          <Box sx={{ mb: 4, textAlign: 'center' }}>
            <img src="/markitome-logo.png" alt="Markitome" style={{ height: 40, marginBottom: 24 }} />
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#1e293b', mb: 1 }}>
              Join Markitome AI
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Fill out the form below to request early access.
            </Typography>
          </Box>

          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={3}>
              <TextField
                fullWidth
                label="Full Name"
                name="fullName"
                required
                variant="outlined"
                value={formData.fullName}
                onChange={handleChange}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
              />
              <TextField
                fullWidth
                label="Company Name"
                name="companyName"
                required
                variant="outlined"
                value={formData.companyName}
                onChange={handleChange}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
              />
              <TextField
                fullWidth
                label="Phone Number"
                name="phoneNumber"
                type="tel"
                required
                variant="outlined"
                value={formData.phoneNumber}
                onChange={handleChange}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
              />
              <TextField
                fullWidth
                label="Business Email"
                name="email"
                type="email"
                required
                variant="outlined"
                value={formData.email}
                onChange={handleChange}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
              />
              
              <Box sx={{ pt: 2 }}>
                <Button
                  fullWidth
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={loading}
                  endIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Send />}
                  sx={{ 
                    borderRadius: 3, 
                    py: 1.8,
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    textTransform: 'none',
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                    }
                  }}
                >
                  {loading ? 'Sending...' : 'Request Early Access'}
                </Button>
              </Box>

              <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ mt: 2, display: 'block' }}>
                By submitting this form, you agree to our Privacy Policy and Terms of Service.
              </Typography>
            </Stack>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default RequestAccess;
