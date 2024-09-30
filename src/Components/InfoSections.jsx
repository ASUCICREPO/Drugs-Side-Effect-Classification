// src/Components/InfoSections.js

import React from "react";
import { Typography, Grid } from "@mui/material";
import {
  ABOUT_US_HEADER_BACKGROUND,
  ABOUT_US_TEXT,
  FAQ_HEADER_BACKGROUND,
  FAQ_TEXT,
  TEXT,
} from "../Utilities/constants";

function InfoSections() {
  return (
    <Grid container direction="column" spacing={2}>
      <Grid item>
        <Typography
          variant="h6"
          sx={{
            fontWeight: "bold",
            color: ABOUT_US_HEADER_BACKGROUND,
          }}
        >
          {TEXT["EN"].ABOUT_US_TITLE}
        </Typography>
      </Grid>
      <Grid item>
        <Typography
          variant="subtitle1"
          sx={{ color: ABOUT_US_TEXT }}
        >
          {TEXT["EN"].ABOUT_US}
        </Typography>
      </Grid>
      <Grid item>
        <Typography
          variant="h6"
          sx={{
            fontWeight: "bold",
            color: FAQ_HEADER_BACKGROUND,
          }}
        >
          {TEXT["EN"].FAQ_TITLE}
        </Typography>
        <ul>
          {TEXT["EN"].FAQS.map((question, index) => (
            <li key={index}>
              <Typography variant="subtitle1" sx={{ color: FAQ_TEXT }}>
                {question}
              </Typography>
            </li>
          ))}
        </ul>
      </Grid>
    </Grid>
  );
}

export default InfoSections;
