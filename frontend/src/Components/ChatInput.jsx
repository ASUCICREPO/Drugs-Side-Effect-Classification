// /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/frontend/src/Components/ChatInput.jsx
import React, { useState, useEffect, useRef } from "react";
import { TextField, Grid, IconButton, Box, InputAdornment, Chip } from "@mui/material"; // Added Chip
import SendIcon from "@mui/icons-material/Send";
import MenuIcon from "@mui/icons-material/Menu";
// import ClearIcon from '@mui/icons-material/Clear'; // Alternative for Chip delete icon
import { ImAttachment } from "react-icons/im";
import { useLanguage } from "../contexts/LanguageContext";
import { TEXT } from "../utilities/constants";
import { useTranscript } from "../contexts/TranscriptContext";
import { useProcessing } from '../contexts/ProcessingContext';

function ChatInput({ onSendMessage, showLeftNav, setLeftNav }) {
  const [message, setMessage] = useState("");
  const [helperText, setHelperText] = useState("");
  const { language } = useLanguage();
  const { transcript, setTranscript, isListening } = useTranscript();
  const { processing } = useProcessing();
  const [isMultilineAllowed, setIsMultilineAllowed] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null); // State for the selected file

  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth <= 768);
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  useEffect(() => {
    if (!isListening && transcript) {
      setMessage(prevMessage => prevMessage ? `${prevMessage} ${transcript}` : transcript);
      setTranscript("");
    }
  }, [isListening, transcript, setTranscript]);

  useEffect(() => {
    const handleResize = () => setIsMultilineAllowed(window.innerWidth > 1000);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleTyping = (event) => {
    if (helperText) setHelperText("");
    setMessage(event.target.value);
  };

  const handleSendMessage = () => {
    if (message.trim() !== "" || selectedFile) { // Allow sending if there's a message OR a file
      console.log("Sending message with file:", selectedFile ? selectedFile.name : "No file");
      onSendMessage(message, selectedFile); // Pass selectedFile to handler
      setMessage("");
      setSelectedFile(null); // Clear file after sending
      if (fileInputRef.current) {
        fileInputRef.current.value = null; // Clear the file input
      }
    } else {
      setHelperText(TEXT[language].HELPER_TEXT);
    }
  };

  const getMessage = (msg, trans, listening) => {
    if (listening && trans.length) {
      return msg.length ? `${msg} ${trans}` : trans;
    }
    return msg;
  };

  const handleAttachClick = () => {
    if (!selectedFile) { // Only open dialog if no file is selected (for single file)
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = (event) => {
    const file = event.target.files[0];
    if (file) {
      console.log("Selected file:", file);
      setSelectedFile(file); // Store the full file object
    }
    // Don't reset event.target.value here, do it on remove or send
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = null; // Clear the actual file input
    }
  };

  const commonInputProps = {
    startAdornment: (
      <InputAdornment position="start">
        <IconButton
          aria-label="attach file"
          onClick={handleAttachClick}
          disabled={processing || isListening || !!selectedFile} // Disable if file already selected
        >
          <ImAttachment />
        </IconButton>
      </InputAdornment>
    ),
    endAdornment: (
      <InputAdornment position="end">
        <IconButton
          aria-label="send"
          disabled={processing || isListening || (message.trim() === "" && !selectedFile)}
          onClick={handleSendMessage}
          color={(message.trim() !== "" || selectedFile) && !(processing || isListening) ? "primary" : "default"}
        >
          <SendIcon />
        </IconButton>
      </InputAdornment>
    ),
  };

  const hiddenFileInput = (
    <input
      type="file"
      ref={fileInputRef}
      onChange={handleFileSelected}
      style={{ display: 'none' }}
    />
  );

  const fileChipDisplay = selectedFile && (
    <Box sx={{ mb: 1, mt: 1, display: 'flex', justifyContent: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
      <Chip
        label={selectedFile.name}
        onDelete={handleRemoveFile}
        color="primary" // Or "default"
        size="small"
      />
    </Box>
  );

  if (!isMobile) {
    return (
      <Box sx={{ width: '100%' }}> {/* Wrapper Box to contain Chip and TextField */}
        {hiddenFileInput}
        {fileChipDisplay}
        <Grid container item className="sendMessageContainer" alignItems="center">
          <TextField
            className="sendMessageContainer"
            multiline={isMultilineAllowed}
            maxRows={8}
            fullWidth
            disabled={isListening}
            placeholder={TEXT[language].CHAT_INPUT_PLACEHOLDER}
            id="USERCHATINPUT_DESKTOP"
            value={getMessage(message, transcript, isListening)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !processing) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            onChange={handleTyping}
            helperText={isListening ? TEXT[language].SPEECH_RECOGNITION_HELPER_TEXT : helperText}
            sx={{ "& fieldset": { border: "none" } }}
            InputProps={commonInputProps}
          />
        </Grid>
      </Box>
    );
  }

  // Mobile version
  return (
      <Box sx={{ width: '100%', px: 2 }}>  {/* Wrapper Box for mobile */}
      {hiddenFileInput}
      {fileChipDisplay}
      <Grid container item className="sendMessageContainer" alignItems="center">
        <Grid item xs={1} container alignItems="center" justifyContent="center">
          {/* <IconButton
            aria-label="menu"
            onClick={() => setLeftNav(!showLeftNav)}
            color="primary"
          >
            <MenuIcon />
          </IconButton> */}
        </Grid>
        <Grid item xs={12}>
          <TextField
            className="sendMessageContainer"
            multiline={false}
            
            fullWidth
            
            disabled={isListening}
            placeholder={TEXT[language].CHAT_INPUT_PLACEHOLDER}
            id="USERCHATINPUT_MOBILE"
            value={getMessage(message, transcript, isListening)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !processing) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            onChange={handleTyping}
            helperText={isListening ? TEXT[language].SPEECH_RECOGNITION_HELPER_TEXT : helperText}
            sx={{ "& fieldset": { border: "none" } }}
            InputProps={commonInputProps}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

export default ChatInput;