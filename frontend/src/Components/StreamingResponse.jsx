import React, { useState, useEffect, useRef } from "react";
import { Grid, Avatar, Typography, IconButton, Tooltip, Box } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import BotAvatar from "../Assets/BotAvatar.svg";
import LoadingAnimation from "../Assets/loading_animation.gif";
import { ALLOW_MARKDOWN_BOT, BOTMESSAGE_TEXT_COLOR } from "../utilities/constants";
import ReactMarkdown from "react-markdown";

const StreamingResponse = ({ websocket, onStreamComplete }) => {
  const [currentStreamText, setCurrentStreamText] = useState("");
  const [showLoading, setShowLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      if (onStreamComplete) onStreamComplete("", [], true);
      return;
    }

    setCurrentStreamText("");
    setShowLoading(true);
    setCopySuccess(false);

    let accumulatedText = "";

    const handleWebSocketMessage = (event) => {
      if (!isMounted.current) return;
      try {
        const jsonData = JSON.parse(event.data);

        if ((jsonData.type === "delta" || jsonData.type === "text") && jsonData.text) {
          if (showLoading) setShowLoading(false);
          accumulatedText += jsonData.text;
          setCurrentStreamText(accumulatedText);
        } else if (jsonData.type === "sources") {
          // We ignore structured sources completely now.
        } else if (jsonData.type === "end" || jsonData.type === "error") {
          const isError = jsonData.type === "error";
          const errorMsg = isError ? jsonData.text : null;
          if (onStreamComplete) onStreamComplete(accumulatedText, [], isError, errorMsg);
        }
      } catch (e) {
        console.error("StreamingResponse: parse error", e, event.data);
        if (onStreamComplete) onStreamComplete(accumulatedText, [], true, "Error parsing response.");
      }
    };

    const handleWebSocketError = (error) => {
      console.error("StreamingResponse WebSocket Error: ", error);
      setShowLoading(false);
      if (onStreamComplete) onStreamComplete(currentStreamText, [], true, "WebSocket connection error.");
    };

    const handleWebSocketClose = (event) => {
      setShowLoading(false);
      if (onStreamComplete) onStreamComplete(currentStreamText, [], true, `WebSocket closed (${event.code}).`);
    };

    websocket.onmessage = handleWebSocketMessage;
    websocket.onerror = handleWebSocketError;
    websocket.onclose = handleWebSocketClose;

    return () => {
      if (!websocket) return;
      if (websocket.onmessage === handleWebSocketMessage) websocket.onmessage = null;
      if (websocket.onerror === handleWebSocketError) websocket.onerror = null;
      if (websocket.onclose === handleWebSocketClose) websocket.onclose = null;
    };
  }, [websocket, onStreamComplete]); // eslint-disable-line

  const handleCopyToClipboard = () => {
    if (!currentStreamText) return;
    navigator.clipboard.writeText(currentStreamText).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    }).catch((err) => console.error("Copy failed", err));
  };

  if (showLoading) {
    return (
      <Box sx={{ width: '100%' }}>
        <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start" spacing={1} wrap="nowrap">
          <Grid item><Avatar alt="Bot Avatar" src={BotAvatar} sx={{ width: 40, height: 40, mt: 1 }} /></Grid>
          <Grid item className="botMessage" xs sx={{ backgroundColor: (theme) => theme.palette.background.botMessage, position: "relative", padding: '10px 15px', borderRadius: '20px', mt: 1, minWidth: '50px', maxWidth: 'calc(100% - 50px)', wordWrap: 'break-word', minHeight: '40px' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 'inherit' }}>
              <img src={LoadingAnimation} alt="Loading..." style={{ width: '40px', height: '40px' }} />
            </Box>
          </Grid>
        </Grid>
      </Box>
    );
  }

  if (!currentStreamText) return null;

  return (
    <Box sx={{ width: '100%' }}>
      <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start" spacing={1} wrap="nowrap">
        <Grid item><Avatar alt="Bot Avatar" src={BotAvatar} sx={{ width: 40, height: 40, mt: 1 }} /></Grid>
        <Grid item className="botMessage" xs sx={{ backgroundColor: (theme) => theme.palette.background.botMessage, position: "relative", padding: '10px 15px', paddingRight: '40px', borderRadius: '20px', mt: 1, minWidth: '50px', maxWidth: 'calc(100% - 50px)', wordWrap: 'break-word', minHeight: '40px' }}>
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