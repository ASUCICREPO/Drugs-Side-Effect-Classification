// src/Components/AppHeader.jsx
import React from "react";
import { AppBar, Grid, Box, Typography, useTheme } from "@mui/material";
import Logo from "../Assets/tobi.png";
import Switch from "./Switch.jsx";
import headerBg from "../Assets/HeaderBackend.png"; // <- import your header background image
import { ALLOW_MULTLINGUAL_TOGGLE } from "../utilities/constants";

function AppHeader({ showSwitch }) {
  const theme = useTheme();

  return (
<AppBar
  position="static"
  sx={{
    height: '100%',
    boxShadow: 'none',
    // borderBottom: (theme) => `1.5px solid ${theme.palette.primary[50]}`,
    display: 'flex',
    justifyContent: 'center',
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",

    // you can keep the bg here, but it's already on the wrapper;
    // if the wrapper has it, you can drop these 4 lines:
    backgroundImage: `url(${headerBg})`,
    backgroundPosition: 'center',
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    backgroundColor: 'transparent',
  }}
>
  <Grid
    container
    direction="row"
    justifyContent="space-between"
    alignItems="center"
    sx={{
      height: '100%',
      backgroundColor: 'transparent',
      padding: { xs: '0 1rem', md: '0 3rem' },
    }}
  >
    <Grid item sx={{ width: { xs: 32, md: 64 } }} />

    <Grid item xs sx={{ height: "100%" }}>
  <Box
  sx={{
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    boxSizing: "border-box",
    // Give the top a little extra breathing room
    pt: "clamp(14px, 2.2vh, 30px)",
    pb: "clamp(8px, 1.2vh, 16px)",
    gap: 0.75, // spacing between logo and title
  }}
>
    <Box
      component="img"
      src={Logo}
      alt="App main Logo"
      sx={{
        width: "auto",
        height: "clamp(40px, 8vh, 96px)",
        objectFit: "contain",
      }}
    />

    <Typography
      variant="h6"
      sx={{
        // Remove external margins so gap + py fully control spacing
        m: 0,
        fontWeight: 500,                         // not bold
        color: "#FFFFFF",
        fontSize: "clamp(18px, 2.6vw, 32px)",
        lineHeight: 1.2,
      }}
    >
      Tobi
    </Typography>

    <Typography
      variant="body2"
      sx={{
        m: 0,
        color: "rgba(255,255,255,0.85)",
        fontSize: "clamp(12px, 1.6vw, 16px)",
      }}
    />
  </Box>
</Grid>

    <Grid item sx={{ width: { xs: 32, md: 64 } }}>
      <Grid
        container
        alignItems="center"
        justifyContent="flex-end"
        sx={{ display: ALLOW_MULTLINGUAL_TOGGLE && showSwitch ? 'flex' : 'none' }}
      >
        <Switch />
      </Grid>
    </Grid>
  </Grid>
</AppBar>
  );
}

export default AppHeader;