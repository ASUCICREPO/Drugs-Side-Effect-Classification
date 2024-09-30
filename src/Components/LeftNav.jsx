// src/Components/LeftNav.js

import React from "react";
import { Grid, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ArrowRightIcon from "@mui/icons-material/ArrowRight";
import InfoSections from "./InfoSections";
import { CHAT_LEFT_PANEL_BACKGROUND, PRIMARY_MAIN } from "../Utilities/constants";

function LeftNav({ showLeftNav = true, setLeftNav }) {
  return (
    <Grid
      container
      direction="column"
      justifyContent="flex-start"
      alignItems="stretch"
      sx={{
        backgroundColor: CHAT_LEFT_PANEL_BACKGROUND,
        height: "100%",
        overflowY: "auto",
        width: showLeftNav ? '100%' : '60px', // Adjust width based on state
        transition: 'width 0.3s', // Smooth transition
      }}
    >
      <Grid
        item
        container
        justifyContent="flex-end"
        alignItems="center"
        sx={{ padding: '8px' }}
      >
        <IconButton onClick={() => setLeftNav(!showLeftNav)} sx={{ color: "#FFFFFF" }}>
          {showLeftNav ? <CloseIcon /> : <ArrowRightIcon />}
        </IconButton>
      </Grid>
      {showLeftNav && (
        <Grid item sx={{ padding: 2 }}>
          <InfoSections />
        </Grid>
      )}
    </Grid>
  );
}

export default LeftNav;
