// /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/frontend/src/Components/WhoAmI.jsx
import React, { useState } from 'react'; // Added useState for Popover
import {
  Box,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  Paper,
  styled,
  IconButton, // Import IconButton
  Popover     // Import Popover
} from '@mui/material';
import { AiOutlineQuestionCircle } from "react-icons/ai"; // Example icon
import { useRole } from '../contexts/RoleContext';

// Custom styled Radio button
const StyledRadio = styled(Radio)(({ theme }) => ({
  color: '#FFFFFF',
  '&.Mui-checked': {
    color: '#FFFFFF',
  },
}));

// Custom styled label
const StyledFormControlLabel = styled(FormControlLabel)(({ theme }) => ({
  marginLeft: 0,
  marginRight: 0,
  '& .MuiFormControlLabel-label': {
    color: '#FFFFFF',
    fontSize: '0.9rem',
  },
}));

// Mock explanations - consider moving these to a constants file or context if they need i18n
const roleExplanations = {
  title: "Role Explanations",
  researchAssistant: {
    title: "Research Assistant",
    description: "Select this role if you are assisting with data collection, analysis, or literature review related to drug side effects and their classification."
  },
  softwareEngineer: {
    title: "Software Engineer",
    description: "Select this role if you're involved in software development or maintenance, or if you need coding assistance."
  },
  genderYouthExpert: {
    title: "Gender and Youth Expert",
    description: "Select this role to apply a gender and youth perspective to the analysis."
  }
};

function WhoAmI() {
  const { selectedRole, setSelectedRole } = useRole();
  const [anchorEl, setAnchorEl] = useState(null); // State for Popover

  const handleRoleChange = (event) => {
    setSelectedRole(event.target.value);
    console.log("Selected Role:", event.target.value);
  };

  const handlePopoverOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handlePopoverClose = () => {
    setAnchorEl(null);
  };

  const openPopover = Boolean(anchorEl);
  const popoverId = openPopover ? 'role-info-popover' : undefined;

  return (
    <Paper
      elevation={0}
      sx={{
        backgroundColor: '#003A5D',
        borderRadius: '4px',
        padding: '16px',
        marginBottom: '16px',
        position: 'relative', // Needed for absolute positioning of the IconButton
      }}
    >
      <IconButton
        aria-label="Role explanations"
        aria-describedby={popoverId}
        onClick={handlePopoverOpen}
        sx={{
          position: 'absolute',
          top: 8, // Adjust as needed
          right: 8, // Adjust as needed
          color: '#FFFFFF', // Icon color
        }}
      >
        <AiOutlineQuestionCircle size={20} />
      </IconButton>

      <Typography
        variant="h6"
        sx={{
          fontWeight: 'bold',
          color: '#FFFFFF',
          marginBottom: '12px',
          paddingRight: '30px', // Ensure space for the icon
        }}
      >
        Who am I
      </Typography>

      <RadioGroup
        aria-label="role"
        name="role"
        value={selectedRole}
        onChange={handleRoleChange}
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

      <Popover
        id={popoverId}
        open={openPopover}
        anchorEl={anchorEl}
        onClose={handlePopoverClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <Box sx={{ p: 2, maxWidth: 350, backgroundColor: '#f0f0f0' /* Light background for popover */ }}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
            {roleExplanations.title}
          </Typography>
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>{roleExplanations.researchAssistant.title}</Typography>
            <Typography variant="body2">{roleExplanations.researchAssistant.description}</Typography>
          </Box>
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>{roleExplanations.softwareEngineer.title}</Typography>
            <Typography variant="body2">{roleExplanations.softwareEngineer.description}</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>{roleExplanations.genderYouthExpert.title}</Typography>
            <Typography variant="body2">{roleExplanations.genderYouthExpert.description}</Typography>
          </Box>
        </Box>
      </Popover>
    </Paper>
  );
}

export default WhoAmI;