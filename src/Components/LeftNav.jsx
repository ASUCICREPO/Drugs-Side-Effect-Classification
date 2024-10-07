// src/Components/LeftNav.js

import React from 'react';
import { Grid, IconButton, TextField, Accordion, AccordionSummary, AccordionDetails, Typography, List, ListItem, ListItemText, Divider } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import { CHAT_LEFT_PANEL_BACKGROUND } from "../Utilities/constants";

function LeftNav({ showLeftNav = true, setLeftNav }) {
  const searchHistory = {
    yesterday: [
      { id: 1, query: "React hooks tutorial", date: "2024-10-06" },
    ],
    pastDay: [
      { id: 2, query: "JavaScript async/await", date: "2024-10-05" },
    ],
    pastMonth: [
      { id: 3, query: "CSS Grid vs Flexbox", date: "2024-10-04" },
    ],
  };

  const renderSearchResults = (category, items) => (
    <React.Fragment>
      <Typography variant="subtitle2" sx={{ color: 'rgba(255, 255, 255, 0.7)', mt: 2, mb: 1 }}>
        {category}
      </Typography>
      <List sx={{ width: '100%', bgcolor: 'transparent', p: 0 }}>
        {items.map((item, index) => (
          <React.Fragment key={item.id}>
            <ListItem alignItems="flex-start" sx={{ padding: '8px 0' }}>
              <ListItemText
                primary={item.query}
                primaryTypographyProps={{ color: '#FFFFFF' }}
                secondary={item.date}
                secondaryTypographyProps={{ color: 'rgba(255, 255, 255, 0.7)' }}
              />
            </ListItem>
            {index < items.length - 1 && <Divider component="li" sx={{ borderColor: 'rgba(255, 255, 255, 0.12)' }} />}
          </React.Fragment>
        ))}
      </List>
    </React.Fragment>
  );

  return (
    <Grid
      container
      direction="column"
      justifyContent="flex-start"
      alignItems="stretch"
      sx={{
        backgroundColor: CHAT_LEFT_PANEL_BACKGROUND,
        height: '100%',
        overflowY: 'auto',
        width: showLeftNav ? '300px' : '60px',
        transition: 'width 0.3s',
      }}
    >
      <Grid
        item
        container
        justifyContent="flex-end"
        alignItems="center"
        sx={{ padding: '8px' }}
      >
        <IconButton onClick={() => setLeftNav(!showLeftNav)} sx={{ color: "#FFFFFF" }}>
          {showLeftNav ? <CloseIcon /> : <ArrowRightIcon />}
        </IconButton>
      </Grid>
      {showLeftNav && (
        <Grid item sx={{ padding: 2 }}>
          <Typography variant="h6" sx={{ color: "#FFFFFF", marginBottom: 2 }}>About Us</Typography>
          <Typography variant="body2" sx={{ color: "#FFFFFF", marginBottom: 3 }}>
            Your company description goes here. This is a brief introduction to your organization and its mission.
          </Typography>

          <Accordion
            defaultExpanded
            sx={{
              backgroundColor: 'transparent',
              color: "#FFFFFF",
              '&:before': { display: 'none' },
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ color: "#FFFFFF" }} />}
              sx={{ padding: '0 8px', minHeight: '48px' }}
            >
              <HistoryIcon sx={{ marginRight: 1 }} />
              <Typography>Search History</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ padding: '8px 0' }}>
              <TextField
                fullWidth
                variant="outlined"
                placeholder="Search conversations"
                InputProps={{
                  startAdornment: <SearchIcon sx={{ color: 'action.active', mr: 1 }} />,
                  sx: {
                    borderRadius: '28px',
                    backgroundColor: '#FFFFFF',
                    '& fieldset': { border: 'none' },
                  },
                }}
                sx={{ marginBottom: 2 }}
              />
              {renderSearchResults("Yesterday", searchHistory.yesterday)}
              {renderSearchResults("Past 1 day", searchHistory.pastDay)}
              {renderSearchResults("Past 1 month", searchHistory.pastMonth)}
            </AccordionDetails>
          </Accordion>
        </Grid>
      )}
    </Grid>
  );
}

export default LeftNav;
