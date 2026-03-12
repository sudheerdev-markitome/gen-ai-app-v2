
import { 
  Box, Button, Container, Typography, Stack, 
  Card, CardContent, IconButton, Link,
  AppBar, Toolbar, Grid
} from '@mui/material';
import { 
  AutoAwesome, Campaign, LibraryBooks, BarChart, 
  ChevronRight, Facebook, Twitter, 
  LinkedIn
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const LandingPage = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: <AutoAwesome color="primary" />,
      title: "Intelligent AI Assistant",
      description: "Chat with tailored AI models that understand your brand voice and marketing objectives."
    },
    {
      icon: <Campaign color="primary" />,
      title: "Campaign Management",
      description: "Generate high-converting ad copy, emails, and social media posts in seconds."
    },
    {
      icon: <LibraryBooks color="primary" />,
      title: "Prompt Library",
      description: "Access a curated collection of proven prompts for every marketing scenario."
    },
    {
      icon: <BarChart color="primary" />,
      title: "Real-time Analytics",
      description: "Track performance and optimize your content studio with data-driven insights."
    }
  ];

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation */}
      <AppBar position="sticky" color="default" elevation={0} sx={{ 
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        bgcolor: 'rgba(255,255,255,0.8)',
        backdropFilter: 'blur(10px)'
      }}>
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <img src="/markitome-logo.png" alt="Markitome" style={{ height: 32 }} />
              <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main', display: { xs: 'none', sm: 'block' } }}>
                Markitome AI
              </Typography>
            </Box>
            
            <Stack direction="row" spacing={2}>
              <Button variant="text" onClick={() => navigate('/login')} sx={{ fontWeight: 600 }}>Login</Button>
              <Button variant="contained" onClick={() => navigate('/app?mode=signup')} sx={{ 
                borderRadius: '8px',
                px: 3,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
              }}>
                Get Started
              </Button>
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      {/* Hero Section */}
      <Box sx={{ py: { xs: 8, md: 15 }, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <Container maxWidth="lg">
          <Grid container spacing={4} alignItems="center">
            <Grid size={{ xs: 12, md: 6 }}>
              <Stack spacing={3}>
                <Box>
                  <Typography variant="overline" color="primary.main" sx={{ fontWeight: 700, letterSpacing: 2 }}>
                    INTELLECTUAL CONTENT STUDIO
                  </Typography>
                  <Typography variant="h1" sx={{ 
                    fontSize: { xs: '2.5rem', md: '4rem' }, 
                    fontWeight: 800, 
                    lineHeight: 1.1,
                    mb: 2
                  }}>
                    Scale Your Marketing with <span style={{ color: '#6366f1' }}>Intelligence</span>
                  </Typography>
                  <Typography variant="h5" color="text.secondary" sx={{ fontWeight: 400, maxWidth: '500px' }}>
                    The all-in-one AI platform for modern marketing teams. Automate content, optimize campaigns, and drive growth.
                  </Typography>
                </Box>
                
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <Button 
                    variant="contained" 
                    size="large" 
                    onClick={() => navigate('/app')}
                    sx={{ 
                      borderRadius: '12px',
                      px: 4, py: 1.5,
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                      boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.3)'
                    }}
                    endIcon={<ChevronRight />}
                  >
                    Start Free Trial
                  </Button>
                  <Button 
                    variant="outlined" 
                    size="large" 
                    sx={{ borderRadius: '12px', px: 4, border: '2px solid', fontWeight: 700 }}
                  >
                    Watch Demo
                  </Button>
                </Stack>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', justifyContent: 'center' }}>
              <Box sx={{ 
                position: 'relative',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: '-20px', left: '-20px', right: '-20px', bottom: '-20px',
                  background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)',
                  zIndex: -1
                }
              }}>
                <img 
                  src="/markitome-logo.png" 
                  alt="App Interface" 
                  style={{ 
                    width: '100%', 
                    maxWidth: 500, 
                    borderRadius: 24,
                    filter: 'drop-shadow(0 20px 50px rgba(0,0,0,0.15))'
                  }} 
                />
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Features Section */}
      <Box sx={{ py: 12, bgcolor: 'rgba(99, 102, 241, 0.02)' }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: 8 }}>
            <Typography variant="h3" sx={{ fontWeight: 800, mb: 2 }}>
              Everything you need to succeed
            </Typography>
            <Typography variant="h6" color="text.secondary">
              Powerful tools designed for marketing precision and creative speed.
            </Typography>
          </Box>
          <Grid container spacing={4}>
            {features.map((f, i) => (
              <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
                <Card sx={{ 
                  height: '100%', 
                  borderRadius: 4, 
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                  transition: 'transform 0.2s',
                  '&:hover': { transform: 'translateY(-5px)' }
                }}>
                  <CardContent sx={{ p: 4 }}>
                    <Box sx={{ mb: 2 }}>{f.icon}</Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>{f.title}</Typography>
                    <Typography variant="body2" color="text.secondary">{f.description}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Footer */}
      <Box component="footer" sx={{ py: 8, mt: 'auto', bgcolor: '#fdfdfd', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Stack spacing={2}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <img src="/markitome-logo.png" alt="Markitome" style={{ height: 24 }} />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Markitome AI</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Empowering 5,000+ marketers to create, optimize, and scale their content studio.
                </Typography>
                <Stack direction="row" spacing={1}>
                  <IconButton size="small"><Facebook fontSize="small" /></IconButton>
                  <IconButton size="small"><Twitter fontSize="small" /></IconButton>
                  <IconButton size="small"><LinkedIn fontSize="small" /></IconButton>
                </Stack>
              </Stack>
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>Product</Typography>
              <Stack spacing={1}>
                <Link href="#" variant="body2" color="text.secondary" underline="none">Features</Link>
                <Link href="#" variant="body2" color="text.secondary" underline="none">Prompt Library</Link>
                <Link href="#" variant="body2" color="text.secondary" underline="none">API</Link>
              </Stack>
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>Company</Typography>
              <Stack spacing={1}>
                <Link href="#" variant="body2" color="text.secondary" underline="none">About Us</Link>
                <Link href="#" variant="body2" color="text.secondary" underline="none">Contact</Link>
                <Link href="#" variant="body2" color="text.secondary" underline="none">Careers</Link>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>Legal</Typography>
              <Stack spacing={1}>
                <Link href="/privacy" variant="body2" color="text.secondary" underline="none">Privacy Policy</Link>
                <Link href="/terms" variant="body2" color="text.secondary" underline="none">Terms of Service</Link>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  © {new Date().getFullYear()} Markitome AI. All rights reserved.
                </Typography>
              </Stack>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Box>
  );
};

export default LandingPage;
