// /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/frontend/src/Components/ChatBody.jsx

import React, { useRef, useEffect, useState } from 'react';
import { useCookies } from 'react-cookie';
import { Box, Grid, Avatar, Typography } from '@mui/material';
import Attachment from './Attachment';
import ChatInput from './ChatInput';
import UserAvatar from '../Assets/UserAvatar.svg';
import StreamingResponse from './StreamingResponse';
import createMessageBlock from '../utilities/createMessageBlock';
import { ALLOW_FILE_UPLOAD, ALLOW_VOICE_RECOGNITION, ALLOW_FAQ, USERMESSAGE_TEXT_COLOR, WEBSOCKET_API, ALLOW_CHAT_HISTORY, DISPLAY_SOURCES_BEDROCK_KB } from '../utilities/constants';
import BotFileCheckReply from './BotFileCheckReply';
import SpeechRecognitionComponent from './SpeechRecognition';
import { FAQExamples } from './index';
import { useMessage } from '../contexts/MessageContext';
import { useQuestion } from '../contexts/QuestionContext';
import { useProcessing } from '../contexts/ProcessingContext';
import BotReply from './BotReply';
import { useRole } from '../contexts/RoleContext';

function UserReply({ message }) {
    return (
        <Grid container direction='row' justifyContent='flex-end' alignItems='flex-start' spacing={1}>
           <Grid item className='userMessage' sx={{ backgroundColor: (theme) => theme.palette.background.userMessage, color: USERMESSAGE_TEXT_COLOR, padding: '10px 15px', borderRadius: '20px', maxWidth: '80%', wordWrap: 'break-word', mt: 1 }}>
               <Typography variant='body2'>{message}</Typography>
           </Grid>
           <Grid item sx={{ mt: 1 }}>
               <Avatar alt={'User Profile Pic'} src={UserAvatar} sx={{ width: 40, height: 40 }} />
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

    useEffect(() => {
       if (!WEBSOCKET_API) {
            console.error("WebSocket API URL is not defined.");
            return;
        }
       console.log("Attempting to connect WebSocket...");
       websocket.current = new WebSocket(WEBSOCKET_API);
       websocket.current.onopen = () => {
            console.log("WebSocket Connected");
            setIsWsConnected(true);
        };
       websocket.current.onclose = (event) => {
            console.log(`WebSocket Disconnected. Code: ${event.code}, Reason: ${event.reason}`);
            setIsWsConnected(false);
            if (processing) {
                console.log("WebSocket closed while processing, stopping processing indicator.");
                setProcessing(false);
            }
        };
       websocket.current.onerror = (error) => {
            console.error("WebSocket Error:", error);
            setIsWsConnected(false);
             if (processing) {
                 console.log("WebSocket error while processing, stopping processing indicator.");
                 setProcessing(false);
             }
        };
       return () => {
            if (websocket.current && websocket.current.readyState === WebSocket.OPEN) {
                console.log("Closing WebSocket connection...");
                websocket.current.close();
            } else {
                console.log("WebSocket already closed or closing, no action needed in cleanup.");
            }
        };
    }, [setProcessing]);

    useEffect(() => {
        scrollToBottom();
    }, [messageList]);

    const scrollToBottom = () => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    };

    const handleSendMessage = (messageToSend) => {
       const trimmedMessage = messageToSend ? messageToSend.trim() : "";
       if (!processing && trimmedMessage && websocket.current && websocket.current.readyState === WebSocket.OPEN) {
           setProcessing(true);
           const timestamp = new Date().toISOString();
           const newMessageBlock = createMessageBlock(trimmedMessage, 'USER', 'TEXT', 'SENT', "", "", [], timestamp);
            addMessage(newMessageBlock);
            setQuestionAsked(true);
           const historyToSend = ALLOW_CHAT_HISTORY ? messageList.slice(-20) : [];
           console.log("History being sent in payload:", JSON.stringify(historyToSend));
           const messagePayload = {
                action: 'sendMessage',
                prompt: trimmedMessage,
                role: selectedRole,
                history: historyToSend
            };
           console.log("Sending payload:", JSON.stringify(messagePayload));
            websocket.current.send(JSON.stringify(messagePayload));
       } else if (!trimmedMessage) {
            console.warn("Attempted to send an empty message.");
       } else if (processing) {
            console.warn("Processing another request. Please wait.");
       } else if (!websocket.current || websocket.current.readyState !== WebSocket.OPEN) {
           console.error("WebSocket is not connected. Cannot send message.");
            setIsWsConnected(false);
            setProcessing(false);
            addMessage(createMessageBlock("Connection error. Please refresh the page and try again.", "BOT", "TEXT", "SENT", "", "", [], new Date().toISOString()));
        }
    };

    const handleFileUploadComplete = (file, fileStatus) => {
        console.log(`ChatBody: File upload reported - Name: ${file.name}, Status: ${fileStatus}`);
        if (!processing) {
            setProcessing(true);
            const timestamp = new Date().toISOString();
            const userMessageBlock = createMessageBlock(`File uploaded: ${file.name}`, 'USER', 'FILE', 'SENT', file.name, fileStatus, [], timestamp);
            addMessage(userMessageBlock);
            const botFeedbackText = fileStatus === 'File page limit check succeeded.'
                ? 'File ready for processing...'
                : fileStatus === 'File size limit exceeded.'
                ? 'File size limit exceeded. Please upload a smaller file.'
                : fileStatus === 'Invalid file type.'
                ? 'Invalid file type. Please upload supported file types.'
                : 'File check error. Please try again later.';
            const botMessageBlock = createMessageBlock( botFeedbackText, 'BOT', 'FILE', 'RECEIVED', file.name, fileStatus, [], timestamp );
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

    const handleStreamComplete = (finalText, finalSources, isError, errorMessage = null) => {
        console.log("ChatBody: handleStreamComplete triggered.");
        console.log(`ChatBody: Received finalText: "${finalText}"`);
        console.log("ChatBody: Received finalSources:", finalSources);
        console.log(`ChatBody: Received isError: ${isError}`);
        console.log(`ChatBody: Received errorMessage: ${errorMessage}`);

        const messageTextToAdd = isError && !finalText
            ? errorMessage || "An error occurred processing your request."
            : finalText;

        console.log(`ChatBody: Determined messageTextToAdd: "${messageTextToAdd}"`);

        if (messageTextToAdd || (finalSources && finalSources.length > 0)) {
            const finalSourcesForBlock = (DISPLAY_SOURCES_BEDROCK_KB && finalSources && finalSources.length > 0) ? finalSources : [];
            const displayText = messageTextToAdd || (isError ? "Processing Error." : "Task complete.");

            const botMessageBlock = createMessageBlock(
                displayText,
                "BOT",
                "TEXT",
                "SENT",
                "",
                "",
                finalSourcesForBlock,
                new Date().toISOString()
            );
            console.log("ChatBody: Created botMessageBlock:", JSON.stringify(botMessageBlock));
            console.log("ChatBody: Calling addMessage...");
            addMessage(botMessageBlock);
        } else {
            console.log("ChatBody: Stream ended with no content, sources, or error message to add. Not calling addMessage.");
        }

        console.log("ChatBody: Calling setProcessing(false)...");
        setProcessing(false);
    };


    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                width: '100%',
                overflow: 'hidden',
                margin: 0,
            }}
        >
            {/* Messages Area */}
            <Box
                sx={{
                    flexGrow: 1,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    mb: 1,
                    px: { xs: 2, md: 3 }, 
                    '&::-webkit-scrollbar': { width: '6px' },
                    '&::-webkit-scrollbar-track': { background: '#f1f1f1' },
                    '&::-webkit-scrollbar-thumb': { background: '#888', borderRadius: '3px' },
                    '&::-webkit-scrollbar-thumb:hover': { background: '#555' },
                }}
            >
                <Box sx={{ display: ALLOW_FAQ && !questionAsked ? 'flex' : 'none' }}>
                    <FAQExamples onPromptClick={handlePromptClick} />
                </Box>
                {
                    console.log("ChatBody Rendering messageList:", messageList)
                }
                {messageList.map((msg, index) => (
                    <Box key={`${msg.sentBy}-${msg.timestamp || index}-${index}`} sx={{ mb: 2 }}>
                        {msg.sentBy === 'USER' ? (
                            <UserReply message={msg.message} />
                        ) : msg.sentBy === 'BOT' && msg.type === 'TEXT' ? (
                            console.log(`ChatBody Rendering BotReply for index ${index}, message: "${msg.message}"`),
                            <BotReply message={msg.message} sources={msg.sources} />
                        ) : msg.sentBy === 'BOT' && msg.type === 'FILE' ? (
                            <BotFileCheckReply messageId={index} message={msg.message} fileName={msg.fileName} fileStatus={msg.fileStatus} />
                        ) : msg.sentBy === 'BOT' && msg.type === 'SOURCES' ? (
                            null
                        ) : null}
                    </Box>
                ))}

                {processing && isWsConnected && (
                    <Box sx={{ mb: 2 }}>
                        <StreamingResponse
                            websocket={websocket.current}
                            onStreamComplete={handleStreamComplete}
                        />
                    </Box>
                )}
                <div ref={messagesEndRef} />
            </Box>

            {/* Input Area */}
            <Box
                sx={{
                    display: 'flex',
                    flexShrink: 0,
                    alignItems: 'flex-end',
                    // backgroundColor: 'red', 
                    
                    py: 1, 
                    px: { xs: 2, md: 3 }, 
                    borderTop: (theme) => `1px solid ${theme.palette.divider}`,
                }}
            >
                <Box sx={{
                    display: 'flex',
                    flexGrow: 1,
                    mx: 'auto',
                    alignItems: 'flex-end',
                    bgcolor: 'background.paper', 
                    borderRadius: '25px', 
                    p: '20px 4px', 
                }}>
                    <Box sx={{ display: ALLOW_VOICE_RECOGNITION ? 'flex' : 'none', alignSelf: 'center', ml: 1 }}>
                        <SpeechRecognitionComponent setMessage={setMessage} getMessage={() => message} />
                    </Box>
                    <Box sx={{ display: ALLOW_FILE_UPLOAD ? 'flex' : 'none', alignSelf: 'center' }}>
                         <Attachment onFileUploadComplete={handleFileUploadComplete} />
                    </Box>
                    {/* MODIFIED LINE: Removed flexGrow and set a specific width */}
                        <Box sx={{ flexGrow: 1 }}>

                        <ChatInput
                            onSendMessage={handleSendMessage}
                            showLeftNav={showLeftNav}
                            setLeftNav={setLeftNav}
                                
                        />
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}

export default ChatBody;