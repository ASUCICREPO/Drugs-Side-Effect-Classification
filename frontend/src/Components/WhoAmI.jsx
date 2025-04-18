// /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/frontend/src/Components/WhoAmI.jsx
import React from 'react'; // Removed useState as it's now in context
import {
  Box,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  Paper,
  styled
} from '@mui/material';
import { useRole } from '../contexts/RoleContext'; // *** ADD THIS IMPORT ***

// ... (StyledRadio and StyledFormControlLabel remain the same)
// Custom styled Radio button for better visibility on dark background
const StyledRadio = styled(Radio)(({ theme }) => ({
    color: '#FFFFFF',
    '&.Mui-checked': {
        color: '#FFFFFF',
    },
}));

// Custom styled label for better visibility
const StyledFormControlLabel = styled(FormControlLabel)(({ theme }) => ({
    marginLeft: 0,
    marginRight: 0,
    '& .MuiFormControlLabel-label': {
        color: '#FFFFFF',
        fontSize: '0.9rem',
    },
}));


function WhoAmI() {
  // *** USE CONTEXT STATE ***
  const { selectedRole, setSelectedRole } = useRole();

  const handleRoleChange = (event) => {
    setSelectedRole(event.target.value); // Update context state
    console.log("Selected Role:", event.target.value); // Optional: Log selection
  };

  return (
    <Paper
      elevation={0}
      sx={{
        backgroundColor: '#003A5D', // Keep your theme color
        borderRadius: '4px',
        padding: '16px',
        marginBottom: '16px',
      }}
    >
      <Typography
        variant="h6"
        sx={{
          fontWeight: 'bold',
          color: '#FFFFFF',
          marginBottom: '12px',
        }}
      >
        Who am I
      </Typography>

      <RadioGroup
        aria-label="role"
        name="role"
        value={selectedRole} // Use context state value
        onChange={handleRoleChange} // Use the handler that updates context
      >
        <StyledFormControlLabel
          value="researchAssistant"
          control={<StyledRadio />}
          label="Research Assistant"
        />
        <StyledFormControlLabel
          value="softwareEngineer"
          control={<StyledRadio />}
          label="Software Engineer"
        />
        <StyledFormControlLabel
          value="genderYouthExpert"
          control={<StyledRadio />}
          label="Gender and Youth Expert"
        />
      </RadioGroup>
    </Paper>
  );
}

export default WhoAmI;
