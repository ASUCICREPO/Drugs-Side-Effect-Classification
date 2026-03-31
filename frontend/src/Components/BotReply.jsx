import React from 'react';
import { Grid, Box, Avatar, Typography } from '@mui/material';
import BotAvatar from '../Assets/BotAvatar.svg';
import ReactMarkdown from 'react-markdown';
import { ALLOW_MARKDOWN_BOT, BOTMESSAGE_TEXT_COLOR } from '../utilities/constants';

function BotReply({ message, name = 'Tobi' }) {
  return (
    <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start">
      <Grid item xs="auto" sx={{ maxWidth: '100%' }}>
        <Box
          sx={{
            backgroundColor: (theme) => theme.palette.background.botMessage,
            borderRadius: 2.5,
            p: 1.5,
            maxWidth: { xs: '100%', sm: '80%' },
            wordWrap: 'break-word'
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
          {/* IMPORTANT: No sources list rendered at all. Inline bullets come from backend markdown. */}
        </Box>
      </Grid>
    </Grid>
  );
}

export default BotReply;