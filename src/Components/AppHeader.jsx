// src/Components/AppHeader.js

import React from "react";
import { Grid, AppBar } from "@mui/material";
import Logo from "../Assets/header_logo.svg";
import { PRIMARY_50, HEADER_BACKGROUND } from "../Utilities/constants";

function AppHeader() {
  return (
    <AppBar
      position="static"
      sx={{
        backgroundColor: HEADER_BACKGROUND,
        height: "5rem",
        boxShadow: "none",
        borderBottom: `1.5px solid ${PRIMARY_50}`,
      }}
    >
      <Grid
        container
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ padding: "0 3rem", height: "100%" }}
      >
        <Grid item>
          <img src={Logo} alt="App main Logo" height={64} />
        </Grid>
      </Grid>
    </AppBar>
  );
}

export default AppHeader;
