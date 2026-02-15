import React from 'react';
import { Grid, Avatar, Typography, List, ListItem, Link } from '@mui/material';
import BotAvatar from '../Assets/BotAvatar.svg';
import ReactMarkdown from 'react-markdown';
import { ALLOW_MARKDOWN_BOT, BOTMESSAGE_TEXT_COLOR, DISPLAY_SOURCES_BEDROCK_KB } from '../utilities/constants'; // Assuming BOTMESSAGE_BACKGROUND might be needed via sx

// Helper to get filename (copied from StreamingResponse)
// --- >>> Make sure this improved helper function is at the top <<< ---
const getFileNameFromUrl = (url = '') => {
  if (!url) return 'source';
  try {
      // 1. Find the last '/'
      const lastSlashIndex = url.lastIndexOf('/');
      let fileNameWithQuery = url.substring(lastSlashIndex + 1);

      // 2. Find the first '?' (start of query params)
      const queryIndex = fileNameWithQuery.indexOf('?');

      // 3. Take the part before the '?' if it exists
      let fileNameOnly = (queryIndex !== -1) ? fileNameWithQuery.substring(0, queryIndex) : fileNameWithQuery;

      // 4. Decode URL-encoded characters (e.g., %20 -> space)
      return decodeURIComponent(fileNameOnly);
  } catch (e) {
      console.error("Error getting clean filename from URL:", url, e);
      // Fallback: return the part after the last slash, before query params if possible
      try {
           let fallback = url.substring(url.lastIndexOf('/') + 1);
           const queryIndex = fallback.indexOf('?');
           return (queryIndex !== -1) ? fallback.substring(0, queryIndex) : fallback;
      } catch {
          return 'source'; // Final fallback
      }
  }
};
// --- >>> End Helper Function <<< ---

function BotReply({ message, sources }) {
  // Basic display, maybe use ReactMarkdown, handle sources link display etc.
  return (
    <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start" spacing={1}>
      <Grid item>
        <Avatar
          alt="Bot Avatar"
          src={BotAvatar}
          sx={{
            width: 40,
            height: 40,
            '& .MuiAvatar-img': {
              objectFit: 'contain',
              // p: 1, // Removed padding as BotAvatar.svg likely has whitespace
            },
            mt: 1 // Add margin top to align better with message box
          }}
        />
      </Grid>
      <Grid
        item
        className="botMessage" // Keep class for potential global styling
        xs // Allow item to take remaining space if needed
        sx={{
          backgroundColor: (theme) => theme.palette.background.botMessage,
          position: "relative",
          padding: '10px 15px', // Consistent padding
          borderRadius: '20px', // Match user message style perhaps
          mt: 1, // Align top with avatar's margin top
          minWidth: '50px', // Ensure minimum width
          maxWidth: 'calc(100% - 50px)', // Prevent overflow if container is tight
          wordWrap: 'break-word', // Ensure long words break
        }}
      >
        {/* Main message content */}
        {ALLOW_MARKDOWN_BOT ? (
          <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR} sx={{'& > p': { margin: 0 }}}>
            {/* Render markdown, disable default p margins */}
            <ReactMarkdown>{message || ''}</ReactMarkdown>
          </Typography>
        ) : (
          <Typography variant="body2" color={BOTMESSAGE_TEXT_COLOR}>
            {message || ''}
          </Typography>
        )}

        {/* Display sources nicely if they exist and feature is enabled */}
        {DISPLAY_SOURCES_BEDROCK_KB && sources && sources.length > 0 && (
          <List sx={{ mt: 1, p: 0 }}>
            {sources.map((source, index) => (
              <ListItem key={index} sx={{ p: 0, mb: 0.5 }}>
                 {/* Add page fragment if available */}
                <Link
                    href={source.page ? `${source.url}#page=${source.page}` : source.url}
                    target="_blank"
                    rel="noopener noreferrer" // Security best practice
                    variant="caption"
                    title={source.url} // Show full URL on hover
                    sx={{
                        display: 'block',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%', // Prevent long links from breaking layout
                    }}
                 >
                  {/* Display filename and score */}
                  {getFileNameFromUrl(source.url)} (Score: {source.score?.toFixed(2) ?? 'N/A'})
                </Link>
              </ListItem>
            ))}
          </List>
        )}
      </Grid>
    </Grid>
  );
}

export default BotReply;