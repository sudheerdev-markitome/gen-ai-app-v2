import { Box, Container, Typography, Stack, Breadcrumbs, Link, Divider, Paper } from '@mui/material';
import { NavigateNext } from '@mui/icons-material';

const PrivacyPolicy = () => {
  return (
    <Box sx={{ bgcolor: '#f8fafc', minHeight: '100vh', py: 8 }}>
      <Container maxWidth="md">
        <Paper elevation={0} sx={{ p: { xs: 4, md: 8 }, borderRadius: 6, border: '1px solid rgba(0,0,0,0.05)' }}>
          <Breadcrumbs separator={<NavigateNext fontSize="small" />} sx={{ mb: 4 }}>
            <Link underline="hover" color="inherit" href="/">Home</Link>
            <Typography color="text.primary">Privacy Policy</Typography>
          </Breadcrumbs>
          
          <Typography variant="h2" sx={{ fontWeight: 800, mb: 2 }}>Privacy Policy</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 6 }}>Last Updated: March 12, 2026</Typography>
          
          <Stack spacing={4}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>1. Information We Collect</Typography>
              <Typography variant="body1" sx={{ lineHeight: 1.8 }}>
                We collect information that you provide directly to us, such as when you create an account, use our AI features, or contact support. 
                This may include your name, email address, and any content you generate using Markitome AI.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>2. How We Use Your Information</Typography>
              <Typography variant="body1" sx={{ lineHeight: 1.8 }}>
                We use your information to provide and improve our services, communicate with you, and ensure the security of our platform. 
                Your content generated via AI is used solely to provide the requested service and is not used to train global models unless explicitly permitted.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>3. Data Security</Typography>
              <Typography variant="body1" sx={{ lineHeight: 1.8 }}>
                We implement industry-standard security measures to protect your data. Your connection to our services is encrypted using SSL/TLS, 
                and we utilize secure cloud infrastructure provided by AWS.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>4. Cookies and Tracking</Typography>
              <Typography variant="body1" sx={{ lineHeight: 1.8 }}>
                We use cookies to enhance your experience, remember your preferences, and analyze our traffic. 
                You can manage your cookie preferences through our consent banner or your browser settings.
              </Typography>
            </Box>

            <Divider />

            <Typography variant="body2" color="text.secondary">
              If you have any questions about this Privacy Policy, please contact us at privacy@markitome.com.
            </Typography>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
};

export default PrivacyPolicy;
