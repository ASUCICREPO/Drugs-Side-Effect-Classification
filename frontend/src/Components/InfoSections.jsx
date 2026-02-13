// src/components/InfoSections.js
import React from "react";
import { Typography, Grid, Link } from "@mui/material"; // Import Link
import { useLanguage } from "../contexts/LanguageContext"; // Adjust the import path
import {
  ABOUT_US_HEADER_BACKGROUND,
  ABOUT_US_TEXT,
  TEXT,
  DISPLAY_SEARCH_HISTORY,
} from "../utilities/constants"; // Adjust the import path
import SearchHistory from "./SearchHistory.jsx"; // Import the new component

// Remove the Popover-related code if it was from the previous incorrect component modification
// For example, remove useState, IconButton, Popover, Box, AiOutlineQuestionCircle if they were added here by mistake.

function InfoSections() {
  const { language } = useLanguage();

  return (
    <>
      <Grid item>
        <Typography
          variant="h6"
          sx={{ fontWeight: "bold" }}
          color={ABOUT_US_HEADER_BACKGROUND}
        >
          {TEXT[language].ABOUT_US_TITLE}
        </Typography>
      </Grid>
      <Grid item>
        <Typography variant="subtitle1" color={ABOUT_US_TEXT} paragraph> {/* Added paragraph for better spacing */}
          {TEXT[language].ABOUT_US}
        </Typography>
        <Typography variant="subtitle1" color={ABOUT_US_TEXT}>
          <Link
            href="https://popcouncil.org/"
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              color: ABOUT_US_TEXT, // Inherit color or set a specific link color
              textDecoration: "underline", // Optional: common link styling
              "&:hover": {
                textDecoration: "none", // Optional: remove underline on hover
              },
            }}
          >
            {TEXT[language].MORE_INFO_LINK_TEXT || "Click here for more info"}
          </Link>
        </Typography>
      </Grid>
      {DISPLAY_SEARCH_HISTORY && (
        <Grid item sx={{ mt: 2 }}> {/* Added margin top for spacing */}
          <SearchHistory />
        </Grid>
      )}
    </>
  );
}

export default InfoSections;