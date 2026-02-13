// src/Components/ChatBody.jsx
import React, { useRef, useEffect, useState } from 'react';
import { useCookies } from 'react-cookie';
import { Box, Grid, Typography } from '@mui/material';
import Attachment from './Attachment';
import ChatInput from './ChatInput';
import StreamingResponse from './StreamingResponse';
import createMessageBlock from '../utilities/createMessageBlock';
import {
  ALLOW_FILE_UPLOAD,
  ALLOW_VOICE_RECOGNITION,
  ALLOW_FAQ,
  USERMESSAGE_TEXT_COLOR,
  WEBSOCKET_API,
  ALLOW_CHAT_HISTORY,
  CHAT_TOP_SPACING
} from '../utilities/constants';
import BotFileCheckReply from './BotFileCheckReply';
import SpeechRecognitionComponent from './SpeechRecognition';
import { FAQExamples } from './index';
import { useMessage } from '../contexts/MessageContext';
import { useQuestion } from '../contexts/QuestionContext';
import { useProcessing } from '../contexts/ProcessingContext';
import BotReply from './BotReply';
import { useRole } from '../contexts/RoleContext';

// -------------------- DEV TOGGLE --------------------
// Flip to true/false (or comment out the render block below)
// to quickly show/hide a test user bubble without touching state.
const DEV_SHOW_TEST_MESSAGE = false;
// ---------------------------------------------------

const TOBI_GREETING_MD = `**Hi — I’m Tobi.** I’m your virtual assistant for **SSLN & I2I**.

I can help you:
- Answer questions about programs, policies, and data
- Surface the right resources (with links)
- Compare two programs (with links)
- Summarize PDFs 

Ask me anything to get started. Type **/help** for tips.`;

function UserReply({ message }) {
  return (
    <Grid container direction="row" justifyContent="flex-end" alignItems="flex-start" spacing={1}>
      <Grid
        item
        className="userMessage"
        sx={{
          backgroundColor: (theme) => theme.palette.background.userMessage, // #FCF1F2
          color: '#5d5d5d',
          // Rounder pill shape & breathing room
          px: 4.5,
          py: 3,
          minHeight: 44,
          display: 'inline-flex',
          alignItems: 'center',

          borderRadius: '9999px',
          width: 'fit-content',
          maxWidth: { xs: '78%', md: '60%' },
          overflow: 'hidden',

          // text safety
          wordWrap: 'break-word',
          overflowWrap: 'anywhere',
          mt: 1.5,
          fontFamily: 'inherit',
          boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
        }}
      >
        <Typography
          variant="body2"
          sx={{
            m: 0,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
            color: USERMESSAGE_TEXT_COLOR || '#5d5d5d',
          }}
        >
          {message}
        </Typography>
      </Grid>
    </Grid>
  );
}

function ChatBody({ onFileUpload, showLeftNav, setLeftNav }) {
  const { messageList, addMessage } = useMessage();
  const { questionAsked, setQuestionAsked } = useQuestion();
  const { processing, setProcessing } = useProcessing();
  const { selectedRole } = useRole();
  const [message, setMessage] = useState('');
  const [cookies, setCookie] = useCookies(['userMessages']);
  const messagesEndRef = useRef(null);
  const websocket = useRef(null);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const greetedRef = useRef(false);

  useEffect(() => {
    if (!WEBSOCKET_API) {
      console.error("WebSocket API URL is not defined. Set REACT_APP_WEBSOCKET_API in a .env file.");
      return;
    }
    websocket.current = new WebSocket(WEBSOCKET_API);

    websocket.current.onopen = () => setIsWsConnected(true);
    websocket.current.onclose = () => { setIsWsConnected(false); if (processing) setProcessing(false); };
    websocket.current.onerror = () => { setIsWsConnected(false); if (processing) setProcessing(false); };

    return () => {
      if (websocket.current && websocket.current.readyState === WebSocket.OPEN) {
        websocket.current.close();
      }
    };
  }, []); 

  useEffect(() => {
    if (!greetedRef.current && (!messageList || messageList.length === 0)) {
      const timestamp = new Date().toISOString();
      const botMessageBlock = createMessageBlock(
        TOBI_GREETING_MD,
        'BOT',
        'TEXT',
        'SENT',
        '',
        '',
        [],
        timestamp
      );
      addMessage(botMessageBlock);
      greetedRef.current = true;
    }
  }, [messageList, addMessage]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messageList]);

  const handleSendMessage = (messageToSend) => {
    const trimmedMessage = messageToSend ? messageToSend.trim() : "";
    if (!processing && trimmedMessage && websocket.current && websocket.current.readyState === WebSocket.OPEN) {
      setProcessing(true);
      const timestamp = new Date().toISOString();
      const newMessageBlock = createMessageBlock(trimmedMessage, 'USER', 'TEXT', 'SENT', "", "", [], timestamp);
      addMessage(newMessageBlock);
      setQuestionAsked(true);

      const historyToSend = ALLOW_CHAT_HISTORY ? messageList.slice(-20) : [];
      const messagePayload = { action: 'sendMessage', prompt: trimmedMessage, role: selectedRole, history: historyToSend };
      websocket.current.send(JSON.stringify(messagePayload));
    } else if (!trimmedMessage) {
      console.warn("Attempted to send an empty message.");
    } else if (processing) {
      console.warn("Processing another request.");
    } else if (!websocket.current || websocket.current.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected. Cannot send.");
      setIsWsConnected(false);
      setProcessing(false);
      addMessage(createMessageBlock("Connection error. Please refresh the page and try again.", "BOT", "TEXT", "SENT", "", "", [], new Date().toISOString()));
    }
  };

  const handleFileUploadComplete = (file, fileStatus) => {
    if (!processing) {
      setProcessing(true);
      const timestamp = new Date().toISOString();
      const userMessageBlock = createMessageBlock(`File uploaded: ${file.name}`, 'USER', 'FILE', 'SENT', file.name, fileStatus, [], timestamp);
      addMessage(userMessageBlock);
      const botFeedbackText =
        fileStatus === 'File page limit check succeeded.' ? 'File ready for processing...' :
        fileStatus === 'File size limit exceeded.' ? 'File size limit exceeded. Please upload a smaller file.' :
        fileStatus === 'Invalid file type.' ? 'Invalid file type. Please upload supported file types.' :
        'File check error. Please try again later.';
      const botMessageBlock = createMessageBlock(botFeedbackText, 'BOT', 'FILE', 'RECEIVED', file.name, fileStatus, [], timestamp);
      addMessage(botMessageBlock);
      setQuestionAsked(true);

      if (fileStatus !== 'File page limit check succeeded.') {
        setProcessing(false);
      } else {
        if (onFileUpload) onFileUpload(file, fileStatus);
        setProcessing(false);
      }
    } else {
      console.warn("Cannot upload file while another request is processing.");
    }
  };

  const handlePromptClick = (prompt) => {
    handleSendMessage(prompt);
  };

  const handleStreamComplete = (finalText, _finalSources, isError, errorMessage = null) => {
    const messageTextToAdd = isError && !finalText
      ? errorMessage || "An error occurred processing your request."
      : finalText || (isError ? "Processing Error." : "Task complete.");

    if (messageTextToAdd) {
      const botMessageBlock = createMessageBlock(
        messageTextToAdd,
        "BOT",
        "TEXT",
        "SENT",
        "",
        "",
        [],
        new Date().toISOString()
      );
      addMessage(botMessageBlock);
    }
    setProcessing(false);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', margin: 0 }}>
      {/* Messages */}
      <Box
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          mb: 1,
          px: { xs: 3, md: 5, lg: 8 },
          pt: `${CHAT_TOP_SPACING}px`, // keep if you still want initial top offset
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-track': { background: '#f1f1f1' },
          '&::-webkit-scrollbar-thumb': { background: '#888', borderRadius: '3px' },
          '&::-webkit-scrollbar-thumb:hover': { background: '#555' },
        }}
      >
        {/* DEV: static user bubble for quick layout checks */}
        {DEV_SHOW_TEST_MESSAGE && (
          <Box sx={{ mb: 2 }}>
            <UserReply message="(DEV) This is a test user message to check spacing/rounding/wrapping." />
          </Box>
        )}

        <Box sx={{ display: ALLOW_FAQ && !questionAsked ? 'flex' : 'none' }}>
          <FAQExamples onPromptClick={handlePromptClick} />
        </Box>

        {messageList.map((msg, index) => (
          <Box key={`${msg.sentBy}-${msg.timestamp || index}-${index}`} sx={{ mb: 2 }}>
            {msg.sentBy === 'USER' ? (
              <UserReply message={msg.message} />
            ) : msg.sentBy === 'BOT' && msg.type === 'TEXT' ? (
              <BotReply message={msg.message} />
            ) : msg.sentBy === 'BOT' && msg.type === 'FILE' ? (
              <BotFileCheckReply messageId={index} message={msg.message} fileName={msg.fileName} fileStatus={msg.fileStatus} />
            ) : null}
          </Box>
        ))}

        {/* Live stream */}
        {processing && isWsConnected && (
          <Box sx={{ mb: 2 }}>
            <StreamingResponse websocket={websocket.current} onStreamComplete={handleStreamComplete} />
          </Box>
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input */}
      <Box
        sx={{
          display: 'flex',
          flexShrink: 0,
          alignItems: 'flex-end',
          py: 1,
          px: { xs: 2, md: 3 },
          borderTop: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box sx={{ display: 'flex', flexGrow: 1, mx: 'auto', alignItems: 'flex-end', bgcolor: 'background.paper', borderRadius: '25px', p: '20px 4px' }}>
          <Box sx={{ display: ALLOW_VOICE_RECOGNITION ? 'flex' : 'none', alignSelf: 'center', ml: 1 }}>
            <SpeechRecognitionComponent setMessage={setMessage} getMessage={() => message} />
          </Box>
          <Box sx={{ display: ALLOW_FILE_UPLOAD ? 'flex' : 'none', alignSelf: 'center' }}>
            <Attachment onFileUploadComplete={handleFileUploadComplete} />
          </Box>
          <Box sx={{ flexGrow: 1 }}>
            <ChatInput onSendMessage={handleSendMessage} showLeftNav={showLeftNav} setLeftNav={setLeftNav} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default ChatBody;