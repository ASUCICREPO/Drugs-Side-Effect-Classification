// src/theme.js
import { createTheme } from "@mui/material/styles";
import {
  PRIMARY_MAIN,
  SECONDARY_MAIN,
  CHAT_BODY_BACKGROUND,
  CHAT_LEFT_PANEL_BACKGROUND,
  HEADER_BACKGROUND,
  USERMESSAGE_BACKGROUND,
  BOTMESSAGE_BACKGROUND,
  primary_50
} from "./utilities/constants";

const theme = createTheme({
  typography: {
    // Global font to Arial
    fontFamily: 'Arial, Helvetica, sans-serif',
    body1: {
      fontSize: '16px',
    },
    body2: {
      fontSize: '16px',
    },
  },

  palette: {
    primary: {
      main: PRIMARY_MAIN,
      50: primary_50,
    },
    text: {
      // Use hex (or rgb/hsl), not a named color
      primary: '#5d5d5d',          // testing: main font color red
      secondary: 'rgba(0,0,0,0.6)',
    },
    background: {
      default: CHAT_BODY_BACKGROUND,
      chatBody: CHAT_BODY_BACKGROUND,
      chatLeftPanel: CHAT_LEFT_PANEL_BACKGROUND,
      header: HEADER_BACKGROUND,
      botMessage: BOTMESSAGE_BACKGROUND,
      userMessage: USERMESSAGE_BACKGROUND,
    },
    secondary: {
      main: SECONDARY_MAIN,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          color: '#5d5d5d',        // also hex here for testing
          fontFamily: 'Arial, Helvetica, sans-serif',
        },
      },
    },
  },
});

export default theme;