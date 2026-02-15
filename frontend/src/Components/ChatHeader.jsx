import React, { useState, useEffect } from "react";
import Typography from "@mui/material/Typography";
import { useLanguage } from "../contexts/LanguageContext"; // Adjust the import path
import { TEXT, HEADER_TEXT_GRADIENT } from "../utilities/constants"; // Adjust the import path
import { Container } from "@mui/material";

function ChatHeader({ selectedLanguage }) {
  const { language: contextLanguage } = useLanguage();
  const language = selectedLanguage || contextLanguage || 'EN'; // Use selectedLanguage if provided, otherwise default to contextLanguage or 'EN'
  const [isMobile, setIsMobile] = useState(false);

  // Check if the screen is mobile size
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

  // Don't render anything on mobile
  if (isMobile) {
    return null;
  }

  return (
    <Container
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
      }}
    >
      <Typography variant="h4" className="chatHeaderText" sx={{ background: HEADER_TEXT_GRADIENT, textAlign: 'center' }}>
        {/* {TEXT[language]?.CHAT_HEADER_TITLE || "Default Chat Header Title"} Safe fallback */}
      </Typography>
    </Container>
  );
}

export default ChatHeader;