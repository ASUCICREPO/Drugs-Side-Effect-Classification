import React, { useRef, useEffect, useState } from "react";
import { Grid, Typography, IconButton, Tooltip, Box } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import ReactMarkdown from "react-markdown";
import { keyframes } from "@mui/system";

import { ALLOW_MARKDOWN_BOT, BOTMESSAGE_TEXT_COLOR } from "../utilities/constants";

const bounce = keyframes`
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
`;

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
          // ignore
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [websocket, onStreamComplete]);

  const handleCopyToClipboard = () => {
    if (!currentStreamText) return;
    navigator.clipboard.writeText(currentStreamText)
      .then(() => { setCopySuccess(true); setTimeout(() => setCopySuccess(false), 3000); })
      .catch((err) => console.error("Copy failed", err));
  };

  // Loader (typing dots)
  if (showLoading) {
    return (
      <Box sx={{ width: "100%" }}>
        <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start" spacing={1} wrap="nowrap">
          <Grid item xs sx={{ position: "relative", mt: 1, minWidth: 0, width: "100%", minHeight: "40px" }}>
            <Box role="status" aria-live="polite" aria-label="Assistant is typing"
              sx={{ display: "flex", alignItems: "center", gap: 1.2, height: "100%", minHeight: "inherit", pl: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: (t) => t.palette.text.primary, animation: `${bounce} 1.2s infinite ease-in-out`, animationDelay: "0s", "@media (prefers-reduced-motion: reduce)": { animation: "none" } }} />
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: (t) => t.palette.text.primary, animation: `${bounce} 1.2s infinite ease-in-out`, animationDelay: "0.15s", "@media (prefers-reduced-motion: reduce)": { animation: "none" } }} />
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: (t) => t.palette.text.primary, animation: `${bounce} 1.2s infinite ease-in-out`, animationDelay: "0.3s", "@media (prefers-reduced-motion: reduce)": { animation: "none" } }} />
            </Box>
          </Grid>
        </Grid>
      </Box>
    );
  }

  if (!currentStreamText) return null;

  // Use different styles for markdown vs plain text
  const markdownStyles = {
    whiteSpace: "normal",                   // <— IMPORTANT: let markdown control spacing
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    pr: 4,
    maxWidth: { xs: "85%", md: "70%" },
    // tighten default element margins
    "& p": { margin: "0 0 0.5rem 0" },
    "& ul, & ol": { margin: "0.25rem 0 0.5rem 1.25rem", paddingLeft: "1.25rem" },
    "& li": { margin: "0.15rem 0" },
    // link styling
    "& a, & a:visited": { color: "inherit", textDecoration: "none", borderBottom: "1px dotted currentColor" },
    "& a:hover, & a:focus": { borderBottomStyle: "solid", outline: "none" },
    // code/media safety
    "& pre": { whiteSpace: "pre", overflowX: "auto", maxWidth: "100%", margin: "0.25rem 0" },
    "& code": { wordBreak: "break-word" },
    "& table": { display: "block", width: "100%", overflowX: "auto" },
    "& img, & video": { maxWidth: "100%", height: "auto" },
  };

  const plainTextStyles = {
    whiteSpace: "pre-wrap",                 // preserve newlines for plain text
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    pr: 4,
    maxWidth: { xs: "85%", md: "70%" },
    "& a, & a:visited": { color: "inherit", textDecoration: "none", borderBottom: "1px dotted currentColor" },
    "& a:hover, & a:focus": { borderBottomStyle: "solid", outline: "none" },
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start" spacing={1} wrap="nowrap">
        <Grid item xs sx={{ position: "relative", mt: 1, minWidth: 0, width: "100%", minHeight: "40px" }}>
          {currentStreamText && (
            <Tooltip title={copySuccess ? "Copied" : "Copy current text"}>
              <IconButton size="small" onClick={handleCopyToClipboard} sx={{ position: "absolute", top: 5, right: 5, zIndex: 1 }}>
                {copySuccess ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}

          {ALLOW_MARKDOWN_BOT ? (
            <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR} sx={markdownStyles}>
              <ReactMarkdown>{currentStreamText || "\u00A0"}</ReactMarkdown>
            </Typography>
          ) : (
            <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR} sx={plainTextStyles}>
              {currentStreamText || "\u00A0"}
            </Typography>
          )}
        </Grid>
      </Grid>
    </Box>
  );
};

export default StreamingResponse;