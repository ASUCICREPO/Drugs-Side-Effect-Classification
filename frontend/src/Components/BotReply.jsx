// src/Components/BotReply.jsx
import React, { useState } from 'react';
import { Grid, Box, Avatar, Typography, IconButton, Tooltip } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbDownOffAltIcon from '@mui/icons-material/ThumbDownOffAlt';
import BotAvatar from '../Assets/BotAvatar.svg';
import ReactMarkdown from 'react-markdown';
import { ALLOW_MARKDOWN_BOT, BOTMESSAGE_TEXT_COLOR } from '../utilities/constants';

function BotReply({ message, name = 'Tobi' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const handleUp = () => {
    console.log('Thumbs up clicked');
  };

  const handleDown = () => {
    console.log('Thumbs down clicked');
  };

  return (
    <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start">
      <Grid item xs="auto" sx={{ maxWidth: '100%' }}>
        {/* Bubble */}
        <Box
          sx={{
            backgroundColor: (theme) => theme.palette.background.botMessage,
            borderRadius: 2.5,
            p: 1.5,
            maxWidth: { xs: '100%', sm: '80%' },
            wordWrap: 'break-word',
          }}
        >
          {/* Row 1: avatar + bold name */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar
              alt={`${name} Avatar`}
              src={BotAvatar}
              sx={{ width: 28, height: 28, '& .MuiAvatar-img': { objectFit: 'contain' } }}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: BOTMESSAGE_TEXT_COLOR }}>
              {name}
            </Typography>
          </Box>

          {/* Row 2: message body */}
          <Box sx={{ mt: 1 }}>
            {ALLOW_MARKDOWN_BOT ? (
              <Typography
                variant="body2"
                component="div"
                color={BOTMESSAGE_TEXT_COLOR}
                sx={{ '& > p': { margin: 0 } }}
              >
                <ReactMarkdown>{message || ''}</ReactMarkdown>
              </Typography>
            ) : (
              <Typography variant="body2" color={BOTMESSAGE_TEXT_COLOR}>
                {message || ''}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Actions row (outside the bubble, under it, LEFT-aligned) */}
        <Box sx={{ mt: 0.5, display: 'flex', justifyContent: 'flex-start', gap: 0.5 }}>
          <Tooltip title={copied ? 'Copied' : 'Copy'}>
            <IconButton size="small" onClick={handleCopy} aria-label="Copy message">
              {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Thumbs up">
            <IconButton size="small" onClick={handleUp} aria-label="Thumbs up">
              <ThumbUpOffAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Thumbs down">
            <IconButton size="small" onClick={handleDown} aria-label="Thumbs down">
              <ThumbDownOffAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Grid>
    </Grid>
  );
}

export default BotReply;