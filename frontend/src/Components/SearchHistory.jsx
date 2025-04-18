import React, { useMemo, useState } from "react";
import { useCookies } from "react-cookie";
import { Accordion, AccordionSummary, AccordionDetails, Typography, Box, CircularProgress, IconButton, Tooltip } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import { format, isToday, isYesterday, subDays, startOfWeek, startOfMonth, isAfter } from "date-fns";
import { useMessage } from '../contexts/MessageContext';
import { useQuestion } from '../contexts/QuestionContext';
import { useProcessing } from '../contexts/ProcessingContext';

function SearchHistory() {
  const [cookies, setCookie, removeCookie] = useCookies(["userMessages"]);
  const { addMessage } = useMessage();
  const { setQuestionAsked } = useQuestion();
  const { processing, setProcessing } = useProcessing();
  const searchHistory = cookies.userMessages ? cookies.userMessages.map(msg => ({ date: new Date(msg.timestamp), query: msg.message })) : [];

  const sortedHistory = useMemo(() => {
    const today = [];
    const yesterday = [];
    const thisWeek = [];
    const pastWeek = [];
    const pastMonth = [];

    const startOfThisWeek = startOfWeek(new Date());
    const startOfPastWeek = subDays(startOfThisWeek, 7);
    const startOfThisMonth = startOfMonth(new Date());

    searchHistory.forEach((entry) => {
      if (isToday(entry.date)) {
        today.push(entry.query);
      } else if (isYesterday(entry.date)) {
        yesterday.push(entry.query);
      } else if (isAfter(entry.date, startOfThisWeek)) {
        thisWeek.push(entry.query);
      } else if (isAfter(entry.date, startOfPastWeek)) {
        pastWeek.push(entry.query);
      } else if (isAfter(entry.date, startOfThisMonth)) {
        pastMonth.push(entry.query);
      }
    });

    return [
      { title: "Today", data: today },
      { title: "Yesterday", data: yesterday },
      { title: "This Week", data: thisWeek },
      { title: "Past Week", data: pastWeek },
      { title: "Past Month", data: pastMonth }
    ];
  }, [searchHistory]);

  const [visibleCount, setVisibleCount] = useState(10);
  const loadMoreResults = () => {
    setVisibleCount(prevCount => prevCount + 10);
  };

  const handleScroll = (e) => {
    const bottom = e.target.scrollHeight - e.target.scrollTop === e.target.clientHeight;
    if (bottom) {
      loadMoreResults();
    }
  };

  const handleSearchClick = (query) => {
    if (!processing) {
      setProcessing(true);
      const newMessageBlock = {
        message: query,
        sentBy: 'USER',
        type: 'TEXT',
        state: 'SENT',
        timestamp: new Date().toISOString()
      };
      addMessage(newMessageBlock);
      setQuestionAsked(true);
    }
  };

  const truncateQuery = (query, maxLength = 90) => {
    return query.length > maxLength ? `${query.substring(0, maxLength)}...` : query;
  };

  const [deleted, setDeleted] = useState(false);

  const handleDeleteHistory = () => {
    removeCookie("userMessages", { path: "/" });
    setDeleted(true);
    setTimeout(() => {
      setDeleted(false);
    }, 3000);
  };

  return (
    <div>
      <Accordion 
        defaultExpanded 
        sx={{ 
          backgroundColor: '#003A5D', // Set the background for the entire Accordion
          borderRadius: '4px',
          '&:before': {
            display: 'none', // Remove the default divider
          },
          boxShadow: 'none' // Remove default shadows
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon sx={{ color: "#FFFFFF" }} />}
          aria-controls="search-history-content"
          id="search-history-header"
          sx={{
            padding: '0 8px',
            minHeight: '48px',
            backgroundColor: '#003A5D',
            "& .MuiAccordionSummary-content": {
              margin: 0 // Ensures there is no extra margin that could cause overflow
            }
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 'bold', color: "#FFFFFF" }}>Search History</Typography>
          <Tooltip title={deleted ? "Deleted" : "Delete Search History"} arrow>
            <IconButton 
              onClick={(e) => {
                e.stopPropagation(); // Prevent accordion from toggling
                handleDeleteHistory(); 
              }}
              sx={{ 
                marginLeft: 'auto', 
                color: deleted ? "#4caf50" : "#FFFFFF", 
                transition: 'color 0.3s ease-in-out'
              }}
            >
              {deleted ? <CheckCircleIcon /> : <DeleteIcon />}
            </IconButton>
          </Tooltip>
        </AccordionSummary>
        <AccordionDetails 
          sx={{ 
            padding: '16px', 
            backgroundColor: '#003A5D', 
            maxHeight: { xs: '150px', sm: '200px', md: '250px', lg: '300px' }, 
            overflowY: 'auto', 
            overflowX: 'hidden' // Remove horizontal overflow to prevent triangle artifacts
          }}
          onScroll={handleScroll}
        >
          {sortedHistory.map((section, index) => (
            section.data.length > 0 && (
              <div key={index}>
                <Typography variant="subtitle1" sx={{ fontWeight: "bold", marginTop: 2, color: "#FFFFFF" }}>
                  {section.title}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 1 }}>
                  {section.data.slice(0, visibleCount).map((search, idx) => (
                    <Box
                      key={idx}
                      onClick={() => handleSearchClick(search)}
                      sx={{
                        padding: 2,
                        borderRadius: 2,
                        boxShadow: 3,
                        transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
                        '&:hover': {
                          transform: 'scale(1.1)',
                          boxShadow: 6,
                        },
                        backgroundColor: '#003A5D',
                        cursor: 'pointer'
                      }}
                    >
                      <Typography variant="body1" sx={{ color: "#FFFFFF" }}>{truncateQuery(search)}</Typography>
                    </Box>
                  ))}
                </Box>
              </div>
            )
          ))}
          {visibleCount < searchHistory.length && (
            <Box sx={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}>
              <CircularProgress />
            </Box>
          )}
        </AccordionDetails>
      </Accordion>
    </div>
  );
}

export default SearchHistory;