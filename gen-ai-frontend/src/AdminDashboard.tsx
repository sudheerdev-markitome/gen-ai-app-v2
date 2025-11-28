// src/AdminDashboard.tsx
import React, { useEffect, useState } from 'react';
import {
  Box, Container, Grid, Paper, Typography, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, CircularProgress, Alert, Button,
  Tabs, Tab, Chip
} from '@mui/material';
import { fetchAuthSession } from '@aws-amplify/auth';
import RefreshIcon from '@mui/icons-material/Refresh';

// Data Interfaces
interface UsageLog {
  userId: string; timestamp: string; model: string;
  prompt_tokens: number; completion_tokens: number; total_tokens: number; user_email: string;
}
interface FeedbackItem {
  feedbackId: string; timestamp: string; userEmail: string;
  category: string; message: string; status: string;
}
interface AdminStats {
  total_requests: number; total_tokens: number;
  model_usage: Record<string, number>; active_users_count: number;
  recent_logs: UsageLog[];
}

export const AdminDashboard: React.FC = () => {
  const [tabIndex, setTabIndex] = useState(0);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true); setError('');
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      const headers = { 'Authorization': `Bearer ${token}` };

      // Fetch Stats
      const resStats = await fetch('/api/admin/stats', { headers });
      if (!resStats.ok) throw new Error("Failed to load stats");
      setStats(await resStats.json());

      // Fetch Feedback
      const resFeedback = await fetch('/api/admin/feedback', { headers });
      if (!resFeedback.ok) throw new Error("Failed to load feedback");
      setFeedbackList(await resFeedback.json());

    } catch (err: any) { setError(err.message); } 
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  // --- FIX: Rename 'event' to '_event' to silence unused variable error ---
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabIndex(newValue);
  };

  if (loading && !stats) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>;
  if (error) return <Container sx={{ mt: 4 }}><Alert severity="error">{error}</Alert><Button onClick={fetchData} sx={{ mt: 2 }}>Retry</Button></Container>;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4, pb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Admin Dashboard</Typography>
        <Button startIcon={<RefreshIcon />} onClick={fetchData} variant="outlined">Refresh</Button>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabIndex} onChange={handleTabChange}>
          <Tab label="Overview" />
          <Tab label={`Feedback (${feedbackList.length})`} />
        </Tabs>
      </Box>

      {/* TAB 0: OVERVIEW */}
      {tabIndex === 0 && (
        <>
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 2, height: 140, justifyContent: 'center', display: 'flex', flexDirection: 'column' }}>
                <Typography color="primary">Total Requests</Typography>
                <Typography variant="h3">{stats?.total_requests}</Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 2, height: 140, justifyContent: 'center', display: 'flex', flexDirection: 'column' }}>
                <Typography color="primary">Total Tokens</Typography>
                <Typography variant="h3">{stats?.total_tokens.toLocaleString()}</Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 2, height: 140, justifyContent: 'center', display: 'flex', flexDirection: 'column' }}>
                <Typography color="primary">Active Users</Typography>
                <Typography variant="h3">{stats?.active_users_count}</Typography>
              </Paper>
            </Grid>
          </Grid>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Recent Usage</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow><TableCell>Time</TableCell><TableCell>User</TableCell><TableCell>Model</TableCell><TableCell>Tokens</TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {stats?.recent_logs.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{new Date(row.timestamp).toLocaleString()}</TableCell>
                      <TableCell>{row.user_email || row.userId}</TableCell>
                      <TableCell>{row.model}</TableCell>
                      <TableCell>{row.total_tokens}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}

      {/* TAB 1: FEEDBACK */}
      {tabIndex === 1 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>User Feedback & Bugs</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Message</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {feedbackList.map((fb) => (
                  <TableRow key={fb.feedbackId}>
                    <TableCell>{new Date(fb.timestamp).toLocaleDateString()}</TableCell>
                    <TableCell>{fb.userEmail}</TableCell>
                    <TableCell>
                      <Chip 
                        label={fb.category} 
                        color={fb.category === 'bug' ? 'error' : fb.category === 'feature' ? 'primary' : 'default'} 
                        size="small" 
                      />
                    </TableCell>
                    <TableCell>{fb.message}</TableCell>
                    <TableCell>{fb.status}</TableCell>
                  </TableRow>
                ))}
                {feedbackList.length === 0 && (
                  <TableRow><TableCell colSpan={5} align="center">No feedback submitted yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Container>
  );
};