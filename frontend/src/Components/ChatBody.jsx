import React, { useRef, useEffect, useState } from 'react';
import { Box, Grid, Avatar, Typography } from '@mui/material';
import Attachment from './Attachment';
import ChatInput from './ChatInput';
import UserAvatar from '../Assets/UserAvatar.svg';
import StreamingMessage from './StreamingResponse';
import createMessageBlock from '../utilities/createMessageBlock';
import { ALLOW_FILE_UPLOAD, ALLOW_VOICE_RECOGNITION, ALLOW_FAQ } from '../utilities/constants';
import BotFileCheckReply from './BotFileCheckReply';
import SpeechRecognitionComponent from './SpeechRecognition';
import { FAQExamples } from './index';
import { useMessage } from '../contexts/MessageContext';

function ChatBody({ onFileUpload }) {
  const { messageList, addMessage } = useMessage();
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [questionAsked, setQuestionAsked] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messageList]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSendMessage = (message) => {
    setProcessing(true);
    const newMessageBlock = createMessageBlock(message, 'USER', 'TEXT', 'SENT');
    addMessage(newMessageBlock);
    setQuestionAsked(true);
  };

  const handleFileUploadComplete = (file, fileStatus) => {
    const userMessageBlock = createMessageBlock(
      `File uploaded: ${file.name}`,
      'USER',
      'FILE',
      'SENT',
      file.name,
      fileStatus
    );
    addMessage(userMessageBlock);

    const botMessageBlock = createMessageBlock(
      fileStatus === 'File page limit check succeeded.'
        ? 'Checking file size.'
        : fileStatus === 'File size limit exceeded.'
        ? 'File size limit exceeded. Please upload a smaller file.'
        : 'Network Error. Please try again later.',
      'BOT',
      'FILE',
      'RECEIVED',
      file.name,
      fileStatus
    );
    addMessage(botMessageBlock);

    setQuestionAsked(true);

    if (onFileUpload && fileStatus === 'File page limit check succeeded.') {
      onFileUpload(file, fileStatus);
    }
  };

  const handlePromptClick = (prompt) => {
    handleSendMessage(prompt);
  };

  return (
    <Box display='flex' flexDirection='column' justifyContent='space-between' className='appHeight100 appWidth100'>
      <Box flex={1} overflow='auto' className='chatScrollContainer'>
        <Box sx={{ display: ALLOW_FAQ ? 'flex' : 'none' }}>
          {!questionAsked && <FAQExamples onPromptClick={handlePromptClick} />}
        </Box>
        {messageList.map((msg, index) => (
          <Box key={index} mb={2}>
            {msg.sentBy === 'USER' && msg.type === 'TEXT' ? (
              <>
                <UserReply message={msg.message} />
                <StreamingMessage initialMessage={msg.message} setProcessing={setProcessing} processing={processing} />
              </>
            ) : msg.type === 'FILE' && msg.state === 'RECEIVED' ? (
              <BotFileCheckReply messageId={index} />
            ) : null}
          </Box>
        ))}
        <div ref={messagesEndRef} />
      </Box>

      <Box display='flex' justifyContent='space-between' alignItems='flex-end' sx={{ flexShrink: 0 }}>
        <Box sx={{ display: ALLOW_VOICE_RECOGNITION ? 'flex' : 'none' }}>
          <SpeechRecognitionComponent setMessage={setMessage} getMessage={() => message} />
        </Box>
        <Box sx={{ display: ALLOW_FILE_UPLOAD ? 'flex' : 'none' }}>
          <Attachment onFileUploadComplete={handleFileUploadComplete} />
        </Box>
        <Box sx={{ width: '100%' }} ml={2}>
          <ChatInput onSendMessage={handleSendMessage} processing={processing} message={message} setMessage={setMessage} />
        </Box>
      </Box>
    </Box>
  );
}

export default ChatBody;

function UserReply({ message }) {
  return (
    <Grid container direction='row' justifyContent='flex-end' alignItems='flex-end'>
      <Grid item className='userMessage' sx={{ backgroundColor: (theme) => theme.palette.background.userMessage }}>
        <Typography variant='body2'>{message}</Typography>
      </Grid>
      <Grid item>
        <Avatar alt={'User Profile Pic'} src={UserAvatar} />
      </Grid>
    </Grid>
  );
}