
import { Box, Container, Typography, Stack, Breadcrumbs, Link, Divider, Paper } from '@mui/material';
import { NavigateNext } from '@mui/icons-material';

const TermsOfService = () => {
  return (
    <Box sx={{ bgcolor: '#f8fafc', minHeight: '100vh', py: 8 }}>
      <Container maxWidth="md">
        <Paper elevation={0} sx={{ p: { xs: 4, md: 8 }, borderRadius: 6, border: '1px solid rgba(0,0,0,0.05)' }}>
          <Breadcrumbs separator={<NavigateNext fontSize="small" />} sx={{ mb: 4 }}>
            <Link underline="hover" color="inherit" href="/">Home</Link>
            <Typography color="text.primary">Terms of Service</Typography>
          </Breadcrumbs>
          
          <Typography variant="h2" sx={{ fontWeight: 800, mb: 2 }}>Terms of Service</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 6 }}>Last Updated: March 12, 2026</Typography>
          
          <Stack spacing={4}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>1. Acceptance of Terms</Typography>
              <Typography variant="body1" sx={{ lineHeight: 1.8 }}>
                By accessing or using Markitome AI, you agree to be bound by these Terms of Service. 
                If you do not agree to all of these terms, do not use our services.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>2. Description of Service</Typography>
              <Typography variant="body1" sx={{ lineHeight: 1.8 }}>
                Markitome AI provides AI-powered content generation and marketing assistance tools. 
                We reserve the right to modify or discontinue any feature at any time without notice.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>3. User Responsibilities</Typography>
              <Typography variant="body1" sx={{ lineHeight: 1.8 }}>
                You are responsible for all activity that occurs under your account. 
                You agree not to use the service for any illegal or unauthorized purposes, 
                including generating harmful, abusive, or infringing content.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>4. Intellectual Property</Typography>
              <Typography variant="body1" sx={{ lineHeight: 1.8 }}>
                While you retain ownership of the content you generate, Markitome AI and its licensors 
                own all rights to the underlying platform, algorithms, and logos.
              </Typography>
            </Box>

            <Divider />

            <Typography variant="body2" color="text.secondary">
              For any legal inquiries, please reach out to legal@markitome.com.
            </Typography>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
};

export default TermsOfService;
