// /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/frontend/src/Components/ChatBody.jsx

import React, { useRef, useEffect, useState } from 'react';
import { useCookies } from 'react-cookie';
import { Box, Grid, Avatar, Typography } from '@mui/material'; // Make sure Typography is imported if UserReply uses it directly
import Attachment from './Attachment';
import ChatInput from './ChatInput';
import UserAvatar from '../Assets/UserAvatar.svg';
import StreamingResponse from './StreamingResponse';
import createMessageBlock from '../utilities/createMessageBlock'; // Ensure this is imported
import { ALLOW_FILE_UPLOAD, ALLOW_VOICE_RECOGNITION, ALLOW_FAQ, USERMESSAGE_TEXT_COLOR, WEBSOCKET_API, ALLOW_CHAT_HISTORY, DISPLAY_SOURCES_BEDROCK_KB } from '../utilities/constants'; // Added DISPLAY_SOURCES_BEDROCK_KB
import BotFileCheckReply from './BotFileCheckReply'; // Ensure this component exists
import SpeechRecognitionComponent from './SpeechRecognition'; // Ensure this component exists
import { FAQExamples } from './index'; // Ensure this component exists
import { useMessage } from '../contexts/MessageContext';
import { useQuestion } from '../contexts/QuestionContext';
import { useProcessing } from '../contexts/ProcessingContext';
import BotReply from './BotReply'; // Ensure this component exists
import { useRole } from '../contexts/RoleContext';

// --- UserReply Component (Included for completeness, assuming it's simple) ---
function UserReply({ message }) {
    // Basic example, adjust styling as needed
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
// --- End UserReply ---


function ChatBody({ onFileUpload, showLeftNav, setLeftNav }) {
    const { messageList, addMessage } = useMessage();
    const { questionAsked, setQuestionAsked } = useQuestion();
    const { processing, setProcessing } = useProcessing();
    const { selectedRole } = useRole();
    const [message, setMessage] = useState(''); // State for the input field controlled by ChatInput
    const [cookies, setCookie] = useCookies(['userMessages']); // If using cookies for history persistence
    const messagesEndRef = useRef(null);
    const websocket = useRef(null);
    const [isWsConnected, setIsWsConnected] = useState(false);

    // WebSocket Connection Logic
    useEffect(() => {
       if (!WEBSOCKET_API) {
            console.error("WebSocket API URL is not defined.");
            // Maybe add a user-facing error message here?
            // addMessage(createMessageBlock("Configuration error: Cannot connect.", "BOT", "TEXT", "SENT"));
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
            // Ensure processing stops if connection drops unexpectedly
            if (processing) {
                console.log("WebSocket closed while processing, stopping processing indicator.");
                setProcessing(false);
                // Optionally add a message indicating the connection issue
                // addMessage(createMessageBlock("Connection lost. Please refresh or try again.", "BOT", "TEXT", "SENT"));
            }
        };
       websocket.current.onerror = (error) => {
            console.error("WebSocket Error:", error);
            setIsWsConnected(false);
             // Ensure processing stops on error
             if (processing) {
                 console.log("WebSocket error while processing, stopping processing indicator.");
                 setProcessing(false);
                 // Optionally add a message indicating the connection issue
                 // addMessage(createMessageBlock("Connection error. Please refresh or try again.", "BOT", "TEXT", "SENT"));
             }
        };
        // Cleanup function
       return () => {
            if (websocket.current && websocket.current.readyState === WebSocket.OPEN) {
                 console.log("Closing WebSocket connection...");
                 websocket.current.close();
            } else {
                console.log("WebSocket already closed or closing, no action needed in cleanup.");
            }
        };
    // Add setProcessing dependency as it's used in the listeners to stop indicator
    }, [setProcessing]);

    // Scroll Logic
    useEffect(() => {
        scrollToBottom();
    }, [messageList]); // Trigger scroll whenever messageList changes

    const scrollToBottom = () => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    };

    // Send Message Handler
    const handleSendMessage = (messageToSend) => {
       const trimmedMessage = messageToSend ? messageToSend.trim() : "";
       if (!processing && trimmedMessage && websocket.current && websocket.current.readyState === WebSocket.OPEN) {
           setProcessing(true);
           const timestamp = new Date().toISOString(); // Use ISO string for timestamp consistency
           const newMessageBlock = createMessageBlock(trimmedMessage, 'USER', 'TEXT', 'SENT', "", "", [], timestamp);
           addMessage(newMessageBlock);
           setQuestionAsked(true); // Indicate a question has been asked (hides FAQ)
           // Prepare history - consider limiting the size
           const historyToSend = ALLOW_CHAT_HISTORY ? messageList.slice(-20) : []; // Example: send last 20 messages
           console.log("History being sent in payload:", JSON.stringify(historyToSend));
           // Prepare payload
           const messagePayload = {
                action: 'sendMessage', // Assuming backend route key is 'sendMessage'
                prompt: trimmedMessage,
                role: selectedRole,
                history: historyToSend
            };
           console.log("Sending payload:", JSON.stringify(messagePayload));
           // Send via WebSocket
           websocket.current.send(JSON.stringify(messagePayload));
       } else if (!trimmedMessage) {
            console.warn("Attempted to send an empty message.");
            // Optionally provide feedback to the user (e.g., input field shakes)
       } else if (processing) {
            console.warn("Processing another request. Please wait.");
            // Optionally provide feedback (e.g., disable send button more clearly, show tooltip)
       } else if (!websocket.current || websocket.current.readyState !== WebSocket.OPEN) {
           console.error("WebSocket is not connected. Cannot send message.");
           setIsWsConnected(false); // Update connection state
           setProcessing(false); // Ensure processing stops
           // Add an error message for the user
           addMessage(createMessageBlock("Connection error. Please refresh the page and try again.", "BOT", "TEXT", "SENT", "", "", [], new Date().toISOString()));
       }
    };

    // File Upload Handler (Assuming basic structure - adjust if needed)
    const handleFileUploadComplete = (file, fileStatus) => {
        console.log(`ChatBody: File upload reported - Name: ${file.name}, Status: ${fileStatus}`);
        if (!processing) {
             setProcessing(true); // May want to refine when exactly processing stops for file uploads
             const timestamp = new Date().toISOString();
             const userMessageBlock = createMessageBlock(`File uploaded: ${file.name}`, 'USER', 'FILE', 'SENT', file.name, fileStatus, [], timestamp);
             addMessage(userMessageBlock);
             // Provide immediate feedback based on initial client-side check status
             const botFeedbackText = fileStatus === 'File page limit check succeeded.'
                ? 'File ready for processing...' // Or similar feedback
                : fileStatus === 'File size limit exceeded.'
                ? 'File size limit exceeded. Please upload a smaller file.'
                : fileStatus === 'Invalid file type.' // Assuming Attachment component checks type
                ? 'Invalid file type. Please upload supported file types.'
                : 'File check error. Please try again later.'; // Generic fallback
             const botMessageBlock = createMessageBlock( botFeedbackText, 'BOT', 'FILE', 'RECEIVED', file.name, fileStatus, [], timestamp );
             addMessage(botMessageBlock);
             setQuestionAsked(true); // Treat file upload as interaction start

             // Decide when to stop processing indicator. If file triggers backend: keep true. If only client check: set false.
             // For now, assuming file upload doesn't immediately trigger backend stream:
             if (fileStatus !== 'File page limit check succeeded.') {
                setProcessing(false);
             } else {
                // If further backend processing happens, keep processing=true
                // If not, set false. Let's assume it stops here for now.
                if (onFileUpload) onFileUpload(file, fileStatus); // Notify parent if needed
                 setProcessing(false); // Example: stop processing after initial checks pass
             }
        } else {
            console.warn("Cannot upload file while another request is processing.");
             // Optionally inform the user
        }
    };

    // FAQ Prompt Click Handler
    const handlePromptClick = (prompt) => {
        handleSendMessage(prompt);
    };

    // *** MODIFIED: Callback function with ADDED LOGGING ***
    const handleStreamComplete = (finalText, finalSources, isError, errorMessage = null) => {
        // --- >>> ADDED LOGS <<< ---
        console.log("ChatBody: handleStreamComplete triggered.");
        console.log(`ChatBody: Received finalText: "${finalText}"`);
        console.log("ChatBody: Received finalSources:", finalSources);
        console.log(`ChatBody: Received isError: ${isError}`);
        console.log(`ChatBody: Received errorMessage: ${errorMessage}`);
        // --- >>> END LOGS <<< ---

        // Determine the text to display
        const messageTextToAdd = isError && !finalText
            ? errorMessage || "An error occurred processing your request." // Default error text
            : finalText;

        // --- >>> ADDED LOGS <<< ---
        console.log(`ChatBody: Determined messageTextToAdd: "${messageTextToAdd}"`);
        // --- >>> END LOGS <<< ---

        // Add the final message block if there's text or sources, or if it was an error
        // Ensure we add a block even if only sources exist (e.g., RAG finds sources but LLM fails/is skipped)
        if (messageTextToAdd || (finalSources && finalSources.length > 0)) {
             const finalSourcesForBlock = (DISPLAY_SOURCES_BEDROCK_KB && finalSources && finalSources.length > 0) ? finalSources : [];
             // Ensure we have some text, even if just indicating an error or completion without text
             const displayText = messageTextToAdd || (isError ? "Processing Error." : "Task complete."); // Provide fallback text

             const botMessageBlock = createMessageBlock(
                 displayText, // Use determined or fallback text
                 "BOT",
                 "TEXT", // Keep as TEXT even for errors for consistency
                 "SENT",
                 "", // fileName
                 "", // fileStatus
                 finalSourcesForBlock,
                 new Date().toISOString()
             );
             // --- >>> ADDED LOGS <<< ---
             console.log("ChatBody: Created botMessageBlock:", JSON.stringify(botMessageBlock));
             console.log("ChatBody: Calling addMessage...");
             // --- >>> END LOGS <<< ---
             addMessage(botMessageBlock);
        } else {
            console.log("ChatBody: Stream ended with no content, sources, or error message to add. Not calling addMessage.");
            // If you *always* want some indication the bot finished, uncomment below:
            // addMessage(createMessageBlock("Done.", "BOT", "TEXT", "SENT", "", "", [], new Date().toISOString()));
        }

        // Set processing to false AFTER potentially calling addMessage
        // --- >>> ADDED LOGS <<< ---
        console.log("ChatBody: Calling setProcessing(false)...");
        // --- >>> END LOGS <<< ---
        setProcessing(false);
    };


    // --- Component Rendering ---
    return (
        // Main container Box
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%', // Ensure it takes full height of its container
                width: '100%',
                overflow: 'hidden', // Prevent content spill
                margin: 0,
                padding: '0 1rem', // Horizontal padding
                paddingBottom: 0, // Remove bottom padding if input area handles it
            }}
        >
            {/* Messages Area */}
            <Box
                sx={{
                    flexGrow: 1, // Take available vertical space
                    overflowY: 'auto', // Allow vertical scrolling for messages
                    overflowX: 'hidden', // Prevent horizontal scrolling
                    mb: 1, // Margin below message area, above input
                    pr: 1, // Padding right for scrollbar space maybe
                    // Add custom scrollbar styling if desired
                    '&::-webkit-scrollbar': { width: '6px' },
                    '&::-webkit-scrollbar-track': { background: '#f1f1f1' },
                    '&::-webkit-scrollbar-thumb': { background: '#888', borderRadius: '3px' },
                    '&::-webkit-scrollbar-thumb:hover': { background: '#555' },
                }}
            >
                 {/* FAQ rendering - Only show if feature enabled and no question asked yet */}
                 <Box sx={{ display: ALLOW_FAQ && !questionAsked ? 'flex' : 'none' }}>
                    <FAQExamples onPromptClick={handlePromptClick} />
                 </Box>

                 {/* Display existing messages from messageList context */}
                {
                   // --- >>> ADDED LOG <<< ---
                   // This log will appear every time ChatBody renders
                   console.log("ChatBody Rendering messageList:", messageList)
                }
                {messageList.map((msg, index) => (
                     // Use a robust key, timestamp is good if available and unique enough
                     <Box key={`${msg.sentBy}-${msg.timestamp || index}-${index}`} sx={{ mb: 2 }}>
                         {msg.sentBy === 'USER' ? (
                             <UserReply message={msg.message} />
                         ) : msg.sentBy === 'BOT' && msg.type === 'TEXT' ? (
                             // --- >>> ADDED LOG inside map <<< ---
                             console.log(`ChatBody Rendering BotReply for index ${index}, message: "${msg.message}"`),
                             <BotReply message={msg.message} sources={msg.sources} />
                         ) : msg.sentBy === 'BOT' && msg.type === 'FILE' ? (
                            // Check if BotFileCheckReply component exists and handles file messages
                             <BotFileCheckReply messageId={index} message={msg.message} fileName={msg.fileName} fileStatus={msg.fileStatus} />
                         ) : msg.sentBy === 'BOT' && msg.type === 'SOURCES' ? (
                            // Usually sources are part of the TEXT message, so SOURCES type might not be needed/rendered directly
                             null
                         ) : null}
                    </Box>
                ))}

                 {/* Render StreamingResponse component ONLY when processing is true and WebSocket is connected */}
                 {processing && isWsConnected && (
                    <Box sx={{ mb: 2 }}>
                        <StreamingResponse
                             websocket={websocket.current} // Pass the current WebSocket instance
                             onStreamComplete={handleStreamComplete} // Pass the callback function
                         />
                    </Box>
                )}

                 {/* Empty div at the end to scroll to */}
                 <div ref={messagesEndRef} />
             </Box>

             {/* Input Area */}
             <Box
                sx={{
                    display: 'flex',
                    flexShrink: 0, // Prevent input area from shrinking
                    alignItems: 'flex-end', // Align items to bottom (useful if input grows)
                    pb: {xs: 1, md: 2}, // Padding bottom for spacing
                    pl: { xs: 0, md: 1 }, // Padding left (adjust for screen size)
                    pr: { xs: 0, md: 1 }, // Padding right (adjust for screen size)
                    width: '100%', // Take full width
                    borderTop: (theme) => `1px solid ${theme.palette.divider}`, // Optional top border
                    bgcolor: 'background.paper' // Optional background color
                }}
            >
                {/* Optional Buttons: Speech Recognition */}
                <Box sx={{ display: ALLOW_VOICE_RECOGNITION ? 'flex' : 'none', alignSelf: 'center', mr: 1, mb: 1 }}> {/* Add margin bottom to align with input */}
                    <SpeechRecognitionComponent setMessage={setMessage} getMessage={() => message} />
                </Box>
                {/* Optional Buttons: File Attachment */}
                <Box sx={{ display: ALLOW_FILE_UPLOAD ? 'flex' : 'none', alignSelf: 'center', mr: 1, mb: 1 }}> {/* Add margin bottom */}
                    <Attachment onFileUploadComplete={handleFileUploadComplete} />
                </Box>
                 {/* Main Chat Input Component */}
                 <Box sx={{ flexGrow: 1, width: '100%', ml: 0 }}> {/* Allow input to take remaining space */}
                    <ChatInput
                         onSendMessage={handleSendMessage}
                         showLeftNav={showLeftNav} // Pass props needed by ChatInput
                         setLeftNav={setLeftNav}
                         // Pass message state if ChatInput needs to be controlled (optional)
                         // message={message}
                         // setMessage={setMessage}
                    />
                 </Box>
            </Box>
        </Box> // End Main Container Box
    );
}

export default ChatBody;
// --- IMPORTANT ---
// You will also need to modify your `StreamingResponse.jsx` component.
// It should now accept the `websocket` instance as a prop and set up its
// `onmessage` listener on that instance instead of potentially creating its own connection.
// It will use the message context (`useMessage`) to add the streamed parts and the final message.