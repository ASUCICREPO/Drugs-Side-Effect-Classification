import React, { useState, useEffect } from "react";
import { TextField, Grid, IconButton, Box } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import MenuIcon from "@mui/icons-material/Menu";
import { useLanguage } from "../contexts/LanguageContext";
import { TEXT } from "../utilities/constants";
import { useTranscript } from "../contexts/TranscriptContext";
import InputAdornment from '@mui/material/InputAdornment';
import { useProcessing } from '../contexts/ProcessingContext';

function ChatInput({ onSendMessage, showLeftNav, setLeftNav }) {
  const [message, setMessage] = useState("");
  const [helperText, setHelperText] = useState("");
  const { language } = useLanguage();
  const { transcript, setTranscript, isListening } = useTranscript();
  const { processing } = useProcessing();
  const [isMultilineAllowed, setIsMultilineAllowed] = useState(true); // State to track multiline
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    // Set initial value
    checkIsMobile();
    
    // Add event listener
    window.addEventListener('resize', checkIsMobile);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', checkIsMobile);
    };
  }, []);

  useEffect(() => {
    if (!isListening && transcript) {
      setMessage(prevMessage => prevMessage ? `${prevMessage} ${transcript}` : transcript);
      setTranscript(""); // Clear the transcript buffer
    }
  }, [isListening, transcript, setTranscript]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 1000) {
        setIsMultilineAllowed(false); // Disable multiline for small screens
      } else {
        setIsMultilineAllowed(true); // Enable multiline for larger screens
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []); 

  const handleTyping = (event) => {
    if (helperText) {
      setHelperText("");
    }
    setMessage(event.target.value);
  };

  const handleSendMessage = () => {
    if (message.trim() !== "") {
      onSendMessage(message);
      setMessage("");
    } else {
      setHelperText(TEXT[language].HELPER_TEXT);
    }
  };

  const getMessage = (message, transcript, isListening) => {
    if (isListening) {
      if (transcript.length) {
        return message.length ? `${message} ${transcript}` : transcript;
      }
    }
    return message;
  };

  // If not on mobile, render the original component without the menu button
  if (!isMobile) {
    return (
      <Grid container item className="sendMessageContainer">
        <TextField
          className="sendMessageContainer"
          multiline={isMultilineAllowed}
          maxRows={8}
          fullWidth
          disabled={isListening}
          placeholder={TEXT[language].CHAT_INPUT_PLACEHOLDER}
          id="USERCHATINPUT"
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
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label="send"
                  disabled={processing || isListening}
                  onClick={handleSendMessage}
                  color={message.trim() !== "" ? "primary" : "default"}
                >
                  <SendIcon />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </Grid>
    );
  }

  // Mobile version with menu button
  return (
    <Grid container item className="sendMessageContainer">
      {/* Menu Button */}
      <Grid item xs={1} container alignItems="center" justifyContent="center">
        <IconButton
          aria-label="menu"
          onClick={() => setLeftNav(!showLeftNav)}
          color="primary"
        >
          <MenuIcon />
        </IconButton>
      </Grid>
      
      {/* Search Bar */}
      <Grid item xs={11}>
        <TextField
          className="sendMessageContainer"
          multiline={false}
          fullWidth
          disabled={isListening}
          placeholder={TEXT[language].CHAT_INPUT_PLACEHOLDER}
          id="USERCHATINPUT"
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
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label="send"
                  disabled={processing || isListening}
                  onClick={handleSendMessage}
                  color={message.trim() !== "" ? "primary" : "default"}
                >
                  <SendIcon />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </Grid>
    </Grid>
  );
}

export default ChatInput;