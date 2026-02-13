import React, { useState } from 'react';
import { Grid, Box, Typography, IconButton, Tooltip } from '@mui/material';
import { FiCopy, FiThumbsUp, FiCheck } from 'react-icons/fi';
import { LuThumbsDown } from 'react-icons/lu';
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

  const handleUp = () => console.log('Thumbs up clicked');
  const handleDown = () => console.log('Thumbs down clicked');

  // For Markdown: let markdown control spacing; tighten margins
  const markdownStyles = {
    whiteSpace: 'normal',                // <— key change (no pre-wrap)
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    maxWidth: { xs: '85%', md: '70%' },
    '& p': { margin: '0 0 0.5rem 0' },
    '& ul, & ol': { margin: '0.25rem 0 0.5rem 1.25rem', paddingLeft: '1.25rem' },
    '& li': { margin: '0.15rem 0' },
    // links
    '& a, & a:visited': { color: 'inherit', textDecoration: 'none', borderBottom: '1px dotted currentColor' },
    '& a:hover, & a:focus': { borderBottomStyle: 'solid', outline: 'none' },
    // code/media
    '& pre': { whiteSpace: 'pre', overflowX: 'auto', maxWidth: '100%', margin: '0.25rem 0' },
    '& code': { wordBreak: 'break-word' },
    '& table': { display: 'block', width: '100%', overflowX: 'auto' },
    '& img, & video': { maxWidth: '100%', height: 'auto' },
  };

  // For plain text (non-markdown): preserve explicit newlines
  const plainTextStyles = {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    maxWidth: { xs: '85%', md: '70%' },
    '& a, & a:visited': { color: 'inherit', textDecoration: 'none', borderBottom: '1px dotted currentColor' },
    '& a:hover, & a:focus': { borderBottomStyle: 'solid', outline: 'none' },
  };

  return (
    <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start">
      <Grid item xs sx={{ minWidth: 0, maxWidth: '100%' }}>
        <Box sx={{ p: 0 }}>
          <Box sx={{ mt: 1 }}>
            {ALLOW_MARKDOWN_BOT ? (
              <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR} sx={markdownStyles}>
                <ReactMarkdown>{message || ''}</ReactMarkdown>
              </Typography>
            ) : (
              <Typography variant="body2" color={BOTMESSAGE_TEXT_COLOR} sx={plainTextStyles}>
                {message || ''}
              </Typography>
            )}
          </Box>
        </Box>

        <Box sx={{ mt: 0.5, display: 'flex', justifyContent: 'flex-start', gap: 0.5 }}>
          <Tooltip title={copied ? 'Copied' : 'Copy'}>
            <IconButton size="small" onClick={handleCopy} aria-label="Copy message">
              {copied ? <FiCheck size={16} /> : <FiCopy size={16} />}
            </IconButton>
          </Tooltip>

          <Tooltip title="Thumbs up">
            <IconButton size="small" onClick={handleUp} aria-label="Thumbs up">
              <FiThumbsUp size={16} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Thumbs down">
            <IconButton size="small" onClick={handleDown} aria-label="Thumbs down">
              <LuThumbsDown size={16} />
            </IconButton>
          </Tooltip>
        </Box>
      </Grid>
    </Grid>
  );
}

export default BotReply;