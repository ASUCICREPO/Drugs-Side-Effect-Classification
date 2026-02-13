import React from "react";
import { AppBar, Grid, Box, Typography, useTheme } from "@mui/material";
import Logo from "../Assets/tobi.png";
import Switch from "./Switch.jsx";
import { ALLOW_MULTLINGUAL_TOGGLE } from "../utilities/constants";

function AppHeader({ showSwitch }) {
  const theme = useTheme();

  return (
    <AppBar
      position="static"
      sx={{
        backgroundColor: "pink",
        height: "100%",
        boxShadow: "none",
        borderBottom: `1.5px solid ${theme.palette.primary[50]}`,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <Grid
        container
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{
          height: "100%",
          backgroundColor: theme.palette.background.header,
          padding: { xs: "0 1rem", md: "0 3rem" },
        }}
      >
        {/* Left spacer */}
        <Grid item sx={{ width: { xs: 32, md: 64 } }} />

        {/* Center block */}
        <Grid item xs sx={{ height: "100%" }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              textAlign: "center",
            }}
          >
            <Box
              component="img"
              src={Logo}
              alt="App main Logo"
              sx={{
                // Make image smaller on mobile (xs) and larger on desktop (md)
                height: { xs: "55%", md: "65%" },
                maxHeight: { xs: "80px", md: "140px" },
                width: "auto",
                objectFit: "contain",
              }}
            />
            <Typography
              variant="h6"
              sx={{
                mt: 0.5,
                fontWeight: 500,
                color: theme.palette.text.primary,
                // Use smaller font size on mobile (xs) and larger on desktop (md)
                fontSize: { xs: "1.5rem", md: "2.20rem" },
              }}
            >
              Hi, I’m Tobi
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: theme.palette.text.secondary,
                fontSize: { xs: "0.8rem", md: "1.1rem" },
              }}
            >
              I’m ready to answer any questions about SSLN &amp; I2I.
            </Typography>
          </Box>
        </Grid>

        {/* Right controls */}
        <Grid
          item
          // 1. Give the right spacer the SAME width as the left spacer
          // This ensures the center content is always perfectly aligned.
          sx={{ width: { xs: 32, md: 64 } }}
        >
          <Grid
            container
            alignItems="center"
            justifyContent="flex-end"
            sx={{
              display:
                ALLOW_MULTLINGUAL_TOGGLE && showSwitch ? "flex" : "none",
            }}
          >
            <Switch />
          </Grid>
        </Grid>
      </Grid>
    </AppBar>
  );
}

export default AppHeader;