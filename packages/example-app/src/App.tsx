import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { Container, Typography, Box, Grid2 as Grid } from '@mui/material';
import { FundForm } from './components/FundForm';
import { WithdrawForm } from './components/WithdrawForm';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#14F195',
    },
    secondary: {
      main: '#9945FF',
    },
    background: {
      default: '#1a1a2e',
      paper: '#16213e',
    },
  },
  typography: {
    fontFamily: "'Inter', sans-serif",
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box textAlign="center" mb={6}>
          <Typography
            variant="h3"
            component="h1"
            fontWeight={700}
            sx={{
              background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 1,
            }}
          >
            Privacy Router
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Fund and withdraw through privacy pools
          </Typography>
        </Box>

        <Grid container spacing={4} justifyContent="center">
          <Grid size={{ xs: 12, md: 6 }}>
            <FundForm />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <WithdrawForm />
          </Grid>
        </Grid>
      </Container>
    </ThemeProvider>
  );
}

export default App;
