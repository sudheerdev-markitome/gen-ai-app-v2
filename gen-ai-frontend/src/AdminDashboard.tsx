// src/AdminDashboard.tsx
import React, { useEffect, useState } from 'react';
import {
  Box,
  Container,
  Grid,
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
  Button
} from '@mui/material';
import { fetchAuthSession } from '@aws-amplify/auth';
import RefreshIcon from '@mui/icons-material/Refresh';

// Define the shape of the data we expect from the API
interface UsageLog {
  userId: string;
  timestamp: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  user_email: string;
}

interface AdminStats {
  total_requests: number;
  total_tokens: number;
  model_usage: Record<string, number>;
  active_users_count: number;
  recent_logs: UsageLog[];
}

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = async () => {
    setLoading(true);
    setError('');
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      
      const res = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        if (res.status === 403) throw new Error("Access Denied: You are not an admin.");
        throw new Error(`Failed to fetch stats: ${res.statusText}`);
      }

      const data = await res.json();
      setStats(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading && !stats) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
        <Button onClick={fetchStats} sx={{ mt: 2 }} variant="outlined">Try Again</Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Admin Dashboard
        </Typography>
        <Button startIcon={<RefreshIcon />} onClick={fetchStats} variant="outlined">
          Refresh
        </Button>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size = {{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: 140 }}>
            <Typography component="h2" variant="h6" color="primary" gutterBottom>
              Total Requests
            </Typography>
            <Typography component="p" variant="h3">
              {stats?.total_requests}
            </Typography>
          </Paper>
        </Grid>
        <Grid size = {{ xs:12, md:4}}>
          <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: 140 }}>
            <Typography component="h2" variant="h6" color="primary" gutterBottom>
              Total Tokens Used
            </Typography>
            <Typography component="p" variant="h3">
              {stats?.total_tokens.toLocaleString()}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{xs:12, md:4}}>
          <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: 140 }}>
            <Typography component="h2" variant="h6" color="primary" gutterBottom>
              Active Users
            </Typography>
            <Typography component="p" variant="h3">
              {stats?.active_users_count}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Recent Logs Table */}
      <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
        <Typography component="h2" variant="h6" color="primary" gutterBottom>
          Recent Activity (Last 20 Requests)
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Model</TableCell>
                <TableCell align="right">Prompt Tokens</TableCell>
                <TableCell align="right">Completion Tokens</TableCell>
                <TableCell align="right">Total Cost (Est.)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {stats?.recent_logs.map((row) => (
                <TableRow key={row.timestamp}>
                  <TableCell>{new Date(row.timestamp).toLocaleString()}</TableCell>
                  <TableCell>{row.user_email || row.userId}</TableCell>
                  <TableCell>{row.model}</TableCell>
                  <TableCell align="right">{row.prompt_tokens}</TableCell>
                  <TableCell align="right">{row.completion_tokens}</TableCell>
                  <TableCell align="right">
                    {/* Simple estimation for GPT-4o: ~$5.00/1M input, ~$15.00/1M output */}
                    {row.model.includes('gpt-4o') 
                      ? `$${((row.prompt_tokens * 5 + row.completion_tokens * 15) / 1000000).toFixed(5)}` 
                      : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Container>
  );
};