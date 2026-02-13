// src/Components/ChatHeader.jsx
import React, { useState, useEffect } from "react";
import { Typography } from "@mui/material";
import { useLanguage } from "../contexts/LanguageContext";
import { TEXT } from "../utilities/constants";

function ChatHeader({ selectedLanguage }) {
  const { language: contextLanguage } = useLanguage();
  const language = selectedLanguage || contextLanguage || "EN";
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth <= 768);
    checkIsMobile();
    window.addEventListener("resize", checkIsMobile);
    return () => window.removeEventListener("resize", checkIsMobile);
  }, []);

  if (isMobile) return null;

  return (
    <Typography
      variant="h4"
      className="chatHeaderText"
      sx={{
        // zero footprint outside the text itself
        m: 0,
        p: 0,

        // visuals
        color: "#FFFFFF",
        fontWeight: 400,
        textAlign: "center",
        fontSize: "clamp(18px, 2.6vw, 32px)",
        lineHeight: 1.2,
      }}
    >
      {TEXT[language]?.CHAT_HEADER_TITLE || "Tobi"}
    </Typography>
  );
}

export default ChatHeader;