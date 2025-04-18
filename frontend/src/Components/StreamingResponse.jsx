// /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/frontend/src/Components/StreamingResponse.jsx

import React, { useState, useEffect, useRef } from "react";
import { Grid, Avatar, Typography, IconButton, Tooltip, Box } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import BotAvatar from "../Assets/BotAvatar.svg";
import LoadingAnimation from "../Assets/loading_animation.gif";
import { ALLOW_MARKDOWN_BOT, DISPLAY_SOURCES_BEDROCK_KB, BOTMESSAGE_TEXT_COLOR } from "../utilities/constants";
// Removed useMessage import
import ReactMarkdown from "react-markdown";

const StreamingResponse = ({ websocket, onStreamComplete }) => {
    const [currentStreamText, setCurrentStreamText] = useState("");
    const [sources, setSources] = useState([]); // Still track sources if needed for live display (optional)
    const [showLoading, setShowLoading] = useState(true);
    const [copySuccess, setCopySuccess] = useState(false);
    const isMounted = useRef(true); // Keep mount check

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);


    useEffect(() => {
        if (!websocket || websocket.readyState !== WebSocket.OPEN) {
            console.warn("StreamingResponse: WebSocket instance not available or not open.");
            // Signal completion immediately with error state if WS is bad
            if (onStreamComplete) {
                onStreamComplete("", [], true); // Pass empty text/sources, indicate error
            }
            return;
        }

        console.log("StreamingResponse: Attaching listeners to WebSocket.");
        setCurrentStreamText("");
        setSources([]);
        setShowLoading(true);
        setCopySuccess(false);

        let accumulatedText = "";
        let accumulatedSources = []; // Accumulate sources locally too

        const handleWebSocketMessage = (event) => {
             if (!isMounted.current) {
                console.log("StreamingResponse: Component unmounted, ignoring WS message.");
                return;
            }

            let jsonData = null;
            try {
                jsonData = JSON.parse(event.data);

                if ((jsonData.type === "delta" || jsonData.type === "text") && jsonData.text) {
                    if (showLoading) setShowLoading(false);
                    accumulatedText += jsonData.text;
                    setCurrentStreamText(accumulatedText);
                } else if (jsonData.type === "sources" && jsonData.sources) {
                    console.log("StreamingResponse Sources received: ", jsonData.sources);
                    // Optionally update state if you want to display sources live (uncommon)
                    // setSources(jsonData.sources);
                    accumulatedSources = jsonData.sources; // Store for final callback
                } else if (jsonData.type === "end" || jsonData.type === "error") {
                    const isError = jsonData.type === "error";
                    const errorMsg = isError ? jsonData.text : null;
                    console.log(`StreamingResponse ${isError ? 'Error' : 'End'} signal received.`);

                    // Call completion callback with final data
                    if (onStreamComplete) {
                        console.log("StreamingResponse: Signaling stream completion with final data.");
                        // Pass accumulated text/sources, and error flag
                        onStreamComplete(accumulatedText, accumulatedSources, isError, errorMsg);
                    }
                    // DO NOT add message block here anymore
                    // DO NOT set processing false here

                } else {
                    console.warn("StreamingResponse Received unknown message type:", jsonData.type, jsonData);
                }

            } catch (e) {
                 console.error("StreamingResponse: Error parsing WebSocket message.", e, "Data:", event.data);
                 // Signal completion with error if parsing fails critically
                 if (onStreamComplete) {
                     onStreamComplete(accumulatedText, accumulatedSources, true, "Error parsing response.");
                 }
            }
        };

        const handleWebSocketError = (error) => {
            if (!isMounted.current) return;
            console.error("StreamingResponse WebSocket Error: ", error);
            setShowLoading(false);
             // Signal completion callback with error state
            if (onStreamComplete) {
                onStreamComplete(accumulatedText, accumulatedSources, true, "WebSocket connection error.");
            }
        };

        const handleWebSocketClose = (event) => {
            if (!isMounted.current) return;
            setShowLoading(false);
            console.log(`StreamingResponse WebSocket closed unexpectedly. Code: ${event.code}, Clean: ${event.wasClean}`);
            // Signal completion callback with error state only if not already ended cleanly
            // This requires more state tracking, for simplicity we'll signal potentially again,
            // the parent should handle idempotency if needed.
            if (onStreamComplete) {
                // Pass current accumulated state and indicate error due to unclean close
                 onStreamComplete(accumulatedText, accumulatedSources, true, `WebSocket closed unexpectedly (${event.code}).`);
            }
        };

        websocket.onmessage = handleWebSocketMessage;
        websocket.onerror = handleWebSocketError;
        websocket.onclose = handleWebSocketClose;

        return () => {
            console.log("StreamingResponse: Detaching listeners.");
            if (websocket) {
                 if (websocket.onmessage === handleWebSocketMessage) websocket.onmessage = null;
                 if (websocket.onerror === handleWebSocketError) websocket.onerror = null;
                 if (websocket.onclose === handleWebSocketClose) websocket.onclose = null;
            }
        };
    // Only depends on websocket instance and callback function identity
    }, [websocket, onStreamComplete]);


    const handleCopyToClipboard = () => {
        // Now copies the live text state
        if (!currentStreamText) return;
        navigator.clipboard.writeText(currentStreamText).then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 3000);
        }).catch((err) => {
            console.error("Failed to copy streaming message: ", err);
        });
    };

    // --- Render Logic ---
     if (showLoading) { // Show loading initially
         return ( /* ... loading indicator JSX ... */
            <Box sx={{ width: '100%' }}>
                <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start" spacing={1} wrap="nowrap">
                    <Grid item><Avatar alt="Bot Avatar" src={BotAvatar} sx={{ width: 40, height: 40, mt: 1 }} /></Grid>
                    <Grid item className="botMessage" xs sx={{ /* styles */ backgroundColor: (theme) => theme.palette.background.botMessage, position: "relative", padding: '10px 15px', borderRadius: '20px', mt: 1, minWidth: '50px', maxWidth: 'calc(100% - 50px)', wordWrap: 'break-word', minHeight: '40px' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 'inherit' }}>
                            <img src={LoadingAnimation} alt="Loading..." style={{ width: '40px', height: '40px' }} />
                        </Box>
                    </Grid>
                </Grid>
            </Box>
        );
    }

    // Only render the box if there's actually text being streamed.
    // The final persistent message will be rendered by BotReply in ChatBody.
    if (!currentStreamText) {
        return null; // Don't render an empty box while waiting for the first delta
    }

    // If loading is finished but there's no text yet (and sources haven't arrived), render nothing temporarily
    // This prevents an empty box flashing briefly before text arrives.
    // We rely on the final message block being added by the 'end'/'error' handler.
    if (!showLoading && !currentStreamText && sources.length === 0) {
        // Or, you could potentially keep the loading indicator until the *first* delta or 'end'/'error' if preferred.
        // For now, rendering null once loading is false but text hasn't arrived.
        return null;
    }


    // Render the streaming text as it arrives
    return ( /* ... JSX to display currentStreamText with copy button ... */
        <Box sx={{ width: '100%' }}>
            <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start" spacing={1} wrap="nowrap">
                 <Grid item><Avatar alt="Bot Avatar" src={BotAvatar} sx={{ width: 40, height: 40, mt: 1 }} /></Grid>
                 <Grid item className="botMessage" xs sx={{ /* styles */ backgroundColor: (theme) => theme.palette.background.botMessage, position: "relative", padding: '10px 15px', paddingRight: '40px', borderRadius: '20px', mt: 1, minWidth: '50px', maxWidth: 'calc(100% - 50px)', wordWrap: 'break-word', minHeight: '40px' }}>
                    {currentStreamText && (
                         <Tooltip title={copySuccess ? "Copied" : "Copy current text"}>
                              <IconButton size="small" onClick={handleCopyToClipboard} sx={{ position: "absolute", top: 5, right: 5, zIndex: 1, color: 'grey.600' }}>
                                  {copySuccess ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                              </IconButton>
                          </Tooltip>
                     )}
                      {ALLOW_MARKDOWN_BOT ? (
                         <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR} sx={{ '& > p': { margin: 0 } }}>
                             <ReactMarkdown>{currentStreamText || "\u00A0"}</ReactMarkdown>
                          </Typography>
                      ) : (
                         <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR}>
                              {currentStreamText || "\u00A0"}
                          </Typography>
                      )}
                 </Grid>
             </Grid>
        </Box>
     );
 };
export default StreamingResponse;