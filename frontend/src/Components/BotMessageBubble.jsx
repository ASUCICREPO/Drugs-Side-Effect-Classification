import React from 'react';
import { Box, Avatar, Typography } from '@mui/material';
import BotAvatar from '../Assets/BotAvatar.svg';
import { BOTMESSAGE_BACKGROUND } from '../utilities/constants';

export default function BotMessageBubble({ children, name = 'Tobi' }) {
  return (
    <Box
      sx={{
        background: BOTMESSAGE_BACKGROUND,
        borderRadius: 2.5,
        p: 1.5,
        maxWidth: '80%',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Row 1: avatar + bold name */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Avatar alt={`${name} Avatar`} src={BotAvatar} sx={{ width: 28, height: 28 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {name}
        </Typography>
      </Box>

      {/* Row 2: message content */}
      <Box sx={{ mt: 1 }}>
        {children}
      </Box>
    </Box>
  );
}