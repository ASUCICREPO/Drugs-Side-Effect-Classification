// src/components/LeftNav.js
import React, { useEffect, useState } from "react";
import { Grid, Box } from "@mui/material";
import closeIcon from "../Assets/close.svg"; 
import arrowRightIcon from "../Assets/arrow_right.svg"; 
import PdfPreview from "./PdfPreview"; 
import InfoSections from "./InfoSections"; 
import Avatar from "./Avatar"; 
import VideoPreview from "./VideoPreview"; 
import WhoAmI from "./WhoAmI"; // Import the new WhoAmI component
import { ALLOW_AVATAR_BOT, ALLOW_PDF_PREVIEW, ALLOW_VIDEO_PREVIEW } from "../utilities/constants";

function LeftNav({ showLeftNav = true, setLeftNav, uploadedFile, fileType }) {
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

  // Handle close action specifically
  const handleClose = () => {
    setLeftNav(false);
  };

  return (
    <Box 
      sx={{
        height: '100%',
        width: '100%',
        position: isMobile ? 'fixed' : 'relative',
        zIndex: isMobile ? 1100 : 'auto',
        top: 0,
        left: 0,
        backgroundColor: isMobile ? (theme) => theme.palette.background.chatLeftPanel : (theme) => theme.palette.background.chatLeftPanel,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <Box 
        sx={{ 
          padding: 3,
          paddingBottom: 0, // Remove bottom padding
          display: 'flex', 
          flexDirection: 'column',
          height: '100%',
          overflow: 'auto'
        }}
      >
        {showLeftNav ? (
          <>
            <Box sx={{ alignSelf: 'flex-end', mb: 2 }}>
              <img
                src={closeIcon}
                alt="Close Panel"
                onClick={handleClose}
                style={{ cursor: 'pointer' }}
              />
            </Box>
            
            {/* Add the WhoAmI component here */}
            <Box sx={{ mb: 3 }}>
              <WhoAmI />
            </Box>
            
            <Box sx={{ flexGrow: 1 }}>
              {uploadedFile && fileType === "application/pdf" && ALLOW_PDF_PREVIEW ? (
                <PdfPreview uploadedFile={uploadedFile} highlightedText="fair use"/>
              ) : uploadedFile && fileType === "video/mp4" && ALLOW_VIDEO_PREVIEW ? (
                <VideoPreview uploadedFile={uploadedFile} startTime={0} />
              ) : (
                <>
                  {ALLOW_AVATAR_BOT ? (
                    <Avatar /> // Show the Avatar component if ALLOW_AVATAR_BOT is true
                  ) : (
                    <InfoSections /> // Otherwise, show the InfoSections component
                  )}
                </>
              )}
            </Box>
          </>
        ) : (
          !isMobile && (
            <Box sx={{ alignSelf: 'flex-end' }}>
              <img
                src={arrowRightIcon}
                alt="Open Panel"
                onClick={() => setLeftNav(true)}
                style={{ cursor: 'pointer' }}
              />
            </Box>
          )
        )}
      </Box>
    </Box>
  );
}

export default LeftNav;
