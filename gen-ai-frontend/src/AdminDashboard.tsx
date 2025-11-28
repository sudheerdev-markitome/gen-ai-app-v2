// src/AdminDashboard.tsx
import React, { useEffect, useState } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Button,
  Tabs,
  Tab,
  Chip
  // Stack removed as it was unused
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

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabIndex(newValue);
  };

  if (loading && !stats) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>;
  
  if (error) return (
    <Container sx={{ mt: 4 }}>
      <Alert severity="error">{error}</Alert>
      <Button onClick={fetchData} sx={{ mt: 2 }} variant="outlined">Retry</Button>
    </Container>
  );

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4, pb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Admin Dashboard</Typography>
        <Button startIcon={<RefreshIcon />} onClick={fetchData} variant="outlined">Refresh</Button>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabIndex} onChange={handleTabChange}>
          <Tab label="Overview" />
          <Tab label={`Feedback (${feedbackList?.length ?? 0})`} />
        </Tabs>
      </Box>

      {/* TAB 0: OVERVIEW */}
      {tabIndex === 0 && (
        <>
          {/* Stats Cards Layout using Box (Responsive Flexbox) */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 4 }}>
             {/* Card 1 */}
             <Paper sx={{ p: 2, flex: '1 1 300px', height: 140, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Typography color="primary" variant="h6">Total Requests</Typography>
                <Typography variant="h3">{stats?.total_requests ?? 0}</Typography>
             </Paper>
             {/* Card 2 */}
             <Paper sx={{ p: 2, flex: '1 1 300px', height: 140, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Typography color="primary" variant="h6">Total Tokens</Typography>
                <Typography variant="h3">{stats?.total_tokens?.toLocaleString() ?? 0}</Typography>
             </Paper>
             {/* Card 3 */}
             <Paper sx={{ p: 2, flex: '1 1 300px', height: 140, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Typography color="primary" variant="h6">Active Users</Typography>
                <Typography variant="h3">{stats?.active_users_count ?? 0}</Typography>
             </Paper>
          </Box>

          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Recent Usage</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow><TableCell>Time</TableCell><TableCell>User</TableCell><TableCell>Model</TableCell><TableCell>Tokens</TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {stats?.recent_logs?.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{new Date(row.timestamp).toLocaleString()}</TableCell>
                      <TableCell>{row.user_email || row.userId}</TableCell>
                      <TableCell>{row.model}</TableCell>
                      <TableCell>{row.total_tokens ?? 0}</TableCell>
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
                {feedbackList?.map((fb) => (
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
                {(!feedbackList || feedbackList.length === 0) && (
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